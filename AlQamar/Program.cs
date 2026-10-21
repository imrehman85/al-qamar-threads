using System.Security.Claims;
using System.Text.Json;
using System.Text.RegularExpressions;
using AlQamar;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

const decimal Shipping = 3.99m, FreeOver = 50m;
const int MaxQty = 10, MaxLines = 20;
string[] statuses = ["Awaiting payment", "Processing", "Shipped", "Completed", "Refunded", "Cancelled"];
var webJson = new JsonSerializerOptions(JsonSerializerDefaults.Web);
var emailRx = new Regex(@"^[^\s@]+@[^\s@]+\.[^\s@]+$");

var builder = WebApplication.CreateBuilder(args);
// Read the connection string per request, so editing appsettings.Production.json takes effect without a restart.
builder.Services.AddDbContext<ShopDb>((sp, o) =>
    o.UseSqlServer(sp.GetRequiredService<IConfiguration>().GetConnectionString("Default")));
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(o =>
{
    o.Cookie.Name = "aqt_admin";
    o.Cookie.HttpOnly = true;
    o.Cookie.SameSite = SameSiteMode.Strict;
    o.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
    o.ExpireTimeSpan = TimeSpan.FromHours(12);
    o.SlidingExpiration = true;
    // API callers get status codes, not redirects to a login page.
    o.Events.OnRedirectToLogin = c => { c.Response.StatusCode = 401; return Task.CompletedTask; };
    o.Events.OnRedirectToAccessDenied = c => { c.Response.StatusCode = 403; return Task.CompletedTask; };
});
builder.Services.AddAuthorization();
// Limits are per visitor IP, so one person can't lock everyone else out.
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = 429;
    o.AddPolicy("login", http => RateLimitPartition.GetFixedWindowLimiter(ClientIp(http),
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 8, Window = TimeSpan.FromMinutes(5) }));
    o.AddPolicy("public", http => RateLimitPartition.GetFixedWindowLimiter(ClientIp(http),
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 30, Window = TimeSpan.FromMinutes(1) }));
});

var app = builder.Build();

// A bad connection string should not take the whole site down: the shop pages still load,
// /api/health says what is wrong, and setup is retried on the next API call.
string? dbError = null;
var dbReady = false;
var dbLock = new object();
void TryInitialiseDb(IServiceProvider services)
{
    lock (dbLock)
    {
        if (dbReady) return;
        try
        {
            using var scope = services.CreateScope();
            ShopDb.Initialise(scope.ServiceProvider.GetRequiredService<ShopDb>(), app.Configuration);
            dbReady = true;
            dbError = null;
        }
        catch (Exception ex)
        {
            dbError = ex.GetBaseException().Message;
            app.Logger.LogError(ex, "Database setup failed");
        }
    }
}
TryInitialiseDb(app.Services);

// Somee's free hosting appends an ad script to every HTML response. When the response carries a
// Content-Length the script lands past the end of the body, and on a reused connection those bytes
// corrupt the next response (blank page until a refresh). Sending HTML without a length (chunked)
// keeps the appended script inside the body.
app.Use((ctx, next) =>
{
    ctx.Response.OnStarting(() =>
    {
        if (ctx.Response.ContentType?.StartsWith("text/html", StringComparison.OrdinalIgnoreCase) == true)
            ctx.Response.ContentLength = null;
        return Task.CompletedTask;
    });
    return next();
});

// The friendly 404 page is for browsers; API callers keep their real status codes (e.g. 429).
app.UseWhen(ctx => !ctx.Request.Path.StartsWithSegments("/api"), b => b.UseStatusCodePagesWithReExecute("/404.html"));
app.UseDefaultFiles();
app.UseStaticFiles();
app.Use(async (ctx, next) =>
{
    if (!dbReady && ctx.Request.Path.StartsWithSegments("/api")) TryInitialiseDb(app.Services);
    await next();
});
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

object ProductDto(Product p) => new
{
    slug = p.Slug, collection = p.Collection, name = p.Name, colour = p.Colour,
    sizes = p.Sizes, prices = p.Prices, img = p.Img, hidden = p.Hidden,
    // Sold out when flagged by hand, or when every tracked size has run out.
    soldOut = p.SoldOut || p.Stock.All(x => x is <= 0), stock = p.Stock, manualSoldOut = p.SoldOut
};
object OrderDto(Order o) => new
{
    no = o.No, date = DateTime.SpecifyKind(o.CreatedAt, DateTimeKind.Utc), status = o.Status, name = o.Name, email = o.Email,
    address = o.Address, items = JsonSerializer.Deserialize<OrderLine[]>(o.ItemsJson, webJson),
    totals = new { sub = o.Subtotal, discount = o.Discount, ship = o.Shipping, total = o.Total },
    discountCode = o.DiscountCode, giftWrap = o.GiftWrap, giftMessage = o.GiftMessage, tracking = o.TrackingNumber
};
object ReviewDto(Review r) => new
{
    id = r.Id, slug = r.ProductSlug, name = r.Name, rating = r.Rating, text = r.Text,
    verified = r.OrderNo is not null, approved = r.Approved, date = DateTime.SpecifyKind(r.CreatedAt, DateTimeKind.Utc)
};
object DiscountDto(DiscountCode d) => new
{
    code = d.Code, kind = d.Kind, value = d.Value, minSubtotal = d.MinSubtotal, active = d.Active, usedCount = d.UsedCount, maxUses = d.MaxUses
};

// Works out what a discount code is worth on a bag. Returns null with a reason when it can't be used.
(decimal discount, bool freeShip, string label)? PriceDiscount(DiscountCode? d, decimal subtotal, out string? reason)
{
    reason = null;
    if (d is null || !d.Active) { reason = "That code isn’t valid."; return null; }
    if (d.MaxUses is int max && d.UsedCount >= max) { reason = "That code has been used up."; return null; }
    if (subtotal < d.MinSubtotal) { reason = $"That code needs a bag of £{d.MinSubtotal:0.##} or more."; return null; }
    return d.Kind switch
    {
        "percent" => (Math.Round(subtotal * Math.Clamp(d.Value, 0, 100) / 100m, 2), false, $"{d.Value:0.##}% off"),
        "amount" => (Math.Min(subtotal, d.Value), false, $"£{d.Value:0.##} off"),
        "freeship" => (0m, true, "Free delivery"),
        _ => null
    };
}

// Stock moves out when an order is placed and back in when it is cancelled.
async Task AdjustStock(ShopDb db, IEnumerable<OrderLine> lines, int sign)
{
    var slugs = lines.Select(l => l.Id).Distinct().ToList();
    var products = await db.Products.Where(p => slugs.Contains(p.Slug)).ToListAsync();
    foreach (var p in products)
    {
        var stock = p.Stock;
        foreach (var l in lines.Where(l => l.Id == p.Slug))
        {
            var i = Array.IndexOf(p.Sizes, l.Size);
            if (i >= 0 && stock[i] is int n) stock[i] = Math.Max(0, n + sign * l.Qty);
        }
        p.Stock = stock;
    }
}
IResult Bad(string message) => Results.BadRequest(new { error = message });

// ---------- Public API ----------
var api = app.MapGroup("/api");

api.MapGet("/health", async (ShopDb db) =>
{
    if (!dbReady) return Results.Json(new { ok = false, database = "Setup failed: " + dbError }, statusCode: 503);
    try { return Results.Ok(new { ok = true, database = "Connected", products = await db.Products.CountAsync() }); }
    catch (Exception ex) { return Results.Json(new { ok = false, database = ex.GetBaseException().Message }, statusCode: 503); }
});

api.MapGet("/products", async (ShopDb db) =>
    (await db.Products.AsNoTracking().OrderBy(p => p.Sort).ToListAsync()).Select(ProductDto));

api.MapPost("/subscribe", async (SubscribeRequest req, ShopDb db) =>
{
    var email = (req.Email ?? "").Trim().ToLowerInvariant();
    if (email.Length > 254 || !emailRx.IsMatch(email)) return Bad("Please enter a valid email address.");
    if (!await db.Subscribers.AnyAsync(s => s.Email == email))
    {
        db.Subscribers.Add(new Subscriber { Email = email, Source = Trim(req.Source, 40, "Website") });
        try { await db.SaveChangesAsync(); } catch (DbUpdateException) { /* signed up twice at once */ }
    }
    return Results.Ok(new { ok = true });
}).RequireRateLimiting("public");

// Prices always come from the database; the browser only says what and how many.
api.MapPost("/orders", async (OrderRequest req, ShopDb db) =>
{
    var c = req.Customer;
    if (c is null) return Bad("Please fill in your details.");
    var email = (c.Email ?? "").Trim();
    if (email.Length > 254 || !emailRx.IsMatch(email)) return Bad("Please enter a valid email address.");
    string[] required = [c.FirstName ?? "", c.LastName ?? "", c.Address1 ?? "", c.City ?? "", c.Postcode ?? ""];
    if (required.Any(string.IsNullOrWhiteSpace)) return Bad("Please fill in your name and delivery address.");
    if (req.Items is not { Length: > 0 }) return Bad("Your bag is empty.");
    if (req.Items.Length > MaxLines) return Bad("Too many items in the bag.");

    await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
    var products = await db.Products.ToDictionaryAsync(p => p.Slug);
    var lines = new Dictionary<string, (OrderLine line, int size)>();
    foreach (var it in req.Items)
    {
        if (it.Slug is null || !products.TryGetValue(it.Slug, out var p) || it.Size < 0 || it.Size >= p.Sizes.Length)
            return Bad("An item in your bag is no longer available.");
        if (it.Qty < 1) return Bad("Please check the quantities in your bag.");
        if (p.Hidden || p.SoldOut) return Results.Conflict(new { error = $"{p.Name} is sold out. Please remove it from your bag." });
        var key = $"{p.Slug}:{it.Size}";
        var qty = Math.Min(MaxQty, (lines.TryGetValue(key, out var prev) ? prev.line.Qty : 0) + it.Qty);
        lines[key] = (new OrderLine(p.Slug, p.Name, p.Sizes[it.Size], p.Prices[it.Size], qty), it.Size);
    }
    foreach (var (line, size) in lines.Values)
    {
        var left = products[line.Id].Stock[size];
        if (left is int n && n < line.Qty)
            return Results.Conflict(new { error = n == 0
                ? $"{line.Name} ({line.Size}) is sold out. Please remove it from your bag."
                : $"Only {n} left of {line.Name} ({line.Size}). Please lower the quantity." });
    }

    var items = lines.Values.Select(v => v.line).ToArray();
    var subtotal = items.Sum(l => l.Price * l.Qty);
    var ship = subtotal >= FreeOver ? 0 : Shipping;
    decimal discount = 0;
    DiscountCode? code = null;
    if (!string.IsNullOrWhiteSpace(req.DiscountCode))
    {
        code = await db.DiscountCodes.FindAsync(req.DiscountCode.Trim().ToUpperInvariant());
        var priced = PriceDiscount(code, subtotal, out var reason);
        if (priced is null) return Bad(reason!);
        discount = priced.Value.discount;
        if (priced.Value.freeShip) ship = 0;
        code!.UsedCount++;
    }
    var giftMessage = (req.Gift?.Message ?? "").Trim();
    var order = new Order
    {
        Name = Trim($"{c.FirstName} {c.LastName}", 120, ""), Email = email,
        Address = Trim(string.Join(", ", new[] { c.Address1, c.City, c.Postcode }.Select(x => x!.Trim())), 300, ""),
        ItemsJson = JsonSerializer.Serialize(items, webJson),
        Subtotal = subtotal, Discount = discount, Shipping = ship, Total = subtotal - discount + ship,
        DiscountCode = code?.Code,
        GiftWrap = req.Gift?.Wrap == true, GiftMessage = giftMessage.Length == 0 ? null : Trim(giftMessage, 200, ""),
        No = "pending-" + Guid.NewGuid().ToString("N")[..10]
    };
    db.Orders.Add(order);
    await AdjustStock(db, items, -1);
    await db.SaveChangesAsync();
    order.No = "AQT-" + (10000 + order.Id);
    await db.SaveChangesAsync();
    await tx.CommitAsync();
    return Results.Ok(OrderDto(order));
}).RequireRateLimiting("public");

// Checkout preview of a discount code. The order endpoint checks it again.
api.MapPost("/discount/check", async (DiscountCheck req, ShopDb db) =>
{
    var code = await db.DiscountCodes.AsNoTracking().FirstOrDefaultAsync(d => d.Code == (req.Code ?? "").Trim().ToUpperInvariant());
    var priced = PriceDiscount(code, req.Subtotal, out var reason);
    if (priced is null) return Bad(reason!);
    return Results.Ok(new { code = code!.Code, discount = priced.Value.discount, freeShip = priced.Value.freeShip, label = priced.Value.label });
}).RequireRateLimiting("public");

// Order tracking for customers: order number plus the email it was placed with.
api.MapGet("/orders/track", async (string? no, string? email, ShopDb db) =>
{
    no = (no ?? "").Trim().ToUpperInvariant();
    email = (email ?? "").Trim();
    var o = await db.Orders.AsNoTracking().FirstOrDefaultAsync(x => x.No == no);
    if (o is null || !string.Equals(o.Email, email, StringComparison.OrdinalIgnoreCase))
        return Results.NotFound(new { error = "We couldn’t find an order with that number and email." });
    return Results.Ok(new
    {
        no = o.No, date = DateTime.SpecifyKind(o.CreatedAt, DateTimeKind.Utc), status = o.Status, tracking = o.TrackingNumber,
        items = JsonSerializer.Deserialize<OrderLine[]>(o.ItemsJson, webJson),
        totals = new { sub = o.Subtotal, discount = o.Discount, ship = o.Shipping, total = o.Total }, giftWrap = o.GiftWrap
    });
}).RequireRateLimiting("public");

// Approved reviews for a product, newest first.
api.MapGet("/reviews", async (string? slug, ShopDb db) =>
{
    var list = await db.Reviews.AsNoTracking().Where(r => r.ProductSlug == slug && r.Approved)
        .OrderByDescending(r => r.CreatedAt).Take(50).ToListAsync();
    return Results.Ok(new { count = list.Count, average = list.Count == 0 ? 0 : Math.Round(list.Average(r => r.Rating), 1), reviews = list.Select(ReviewDto) });
});

// Reviews wait for approval. Buyers who give their order number and email are marked as verified.
api.MapPost("/reviews", async (ReviewRequest req, ShopDb db) =>
{
    var slug = (req.Slug ?? "").Trim();
    if (!await db.Products.AnyAsync(p => p.Slug == slug)) return Bad("Unknown product.");
    if (req.Rating is < 1 or > 5) return Bad("Please choose a rating from 1 to 5 stars.");
    var name = (req.Name ?? "").Trim();
    var text = (req.Text ?? "").Trim();
    if (name.Length is 0 or > 60) return Bad("Please add your name (up to 60 characters).");
    if (text.Length is < 10 or > 1000) return Bad("Please write between 10 and 1,000 characters.");
    string? verified = null;
    if (!string.IsNullOrWhiteSpace(req.OrderNo))
    {
        var no = req.OrderNo.Trim().ToUpperInvariant();
        var o = await db.Orders.AsNoTracking().FirstOrDefaultAsync(x => x.No == no);
        if (o is null || !string.Equals(o.Email, (req.Email ?? "").Trim(), StringComparison.OrdinalIgnoreCase)
            || !(JsonSerializer.Deserialize<OrderLine[]>(o.ItemsJson, webJson) ?? []).Any(l => l.Id == slug))
            return Bad("That order number and email don’t match an order for this product.");
        verified = o.No;
    }
    db.Reviews.Add(new Review { ProductSlug = slug, Name = name, Rating = req.Rating, Text = text, OrderNo = verified });
    await db.SaveChangesAsync();
    return Results.Ok(new { ok = true });
}).RequireRateLimiting("public");

// ---------- Admin API ----------
api.MapPost("/admin/login", async (LoginRequest req, ShopDb db, HttpContext http) =>
{
    var user = await db.AdminUsers.FirstOrDefaultAsync(a => a.Username == (req.Username ?? "").Trim());
    var ok = user is not null &&
             new PasswordHasher<AdminUser>().VerifyHashedPassword(user, user.PasswordHash, req.Password ?? "") != PasswordVerificationResult.Failed;
    if (!ok) return Results.Json(new { error = "That username and password don’t match." }, statusCode: 401);
    var identity = new ClaimsIdentity([new Claim(ClaimTypes.Name, user!.Username)], CookieAuthenticationDefaults.AuthenticationScheme);
    await http.SignInAsync(new ClaimsPrincipal(identity));
    return Results.Ok(new { username = user.Username });
}).RequireRateLimiting("login");

api.MapPost("/admin/logout", async (HttpContext http) => { await http.SignOutAsync(); return Results.Ok(); });

var admin = api.MapGroup("/admin").RequireAuthorization();

admin.MapGet("/me", (ClaimsPrincipal u) => Results.Ok(new { username = u.Identity!.Name }));

admin.MapGet("/orders", async (ShopDb db) =>
    (await db.Orders.AsNoTracking().OrderByDescending(o => o.CreatedAt).Take(1000).ToListAsync()).Select(OrderDto));

admin.MapPatch("/orders/{no}", async (string no, StatusRequest req, ShopDb db) =>
{
    if (!statuses.Contains(req.Status)) return Bad("Unknown status.");
    var o = await db.Orders.FirstOrDefaultAsync(x => x.No == no);
    if (o is null) return Results.NotFound();
    // Cancelling puts the items back in stock; un-cancelling takes them out again.
    var lines = JsonSerializer.Deserialize<OrderLine[]>(o.ItemsJson, webJson) ?? [];
    if (o.Status != "Cancelled" && req.Status == "Cancelled") await AdjustStock(db, lines, +1);
    if (o.Status == "Cancelled" && req.Status != "Cancelled") await AdjustStock(db, lines, -1);
    o.Status = req.Status!;
    if (req.Tracking is not null) o.TrackingNumber = req.Tracking.Trim().Length == 0 ? null : Trim(req.Tracking, 60, "");
    await db.SaveChangesAsync();
    return Results.Ok(OrderDto(o));
});

admin.MapDelete("/orders/{no}", async (string no, ShopDb db) =>
    await db.Orders.Where(x => x.No == no).ExecuteDeleteAsync() > 0 ? Results.Ok() : Results.NotFound());

admin.MapGet("/products", async (ShopDb db) =>
    (await db.Products.AsNoTracking().OrderBy(p => p.Sort).ToListAsync()).Select(ProductDto));

admin.MapPut("/products/{slug}", async (string slug, ProductUpdate req, ShopDb db) =>
{
    var p = await db.Products.FindAsync(slug);
    if (p is null) return Results.NotFound();
    var name = (req.Name ?? "").Trim();
    if (name.Length is 0 or > 120) return Bad("Please enter a product name.");
    if (req.Prices is null || req.Prices.Length != p.Sizes.Length || req.Prices.Any(x => x <= 0 || x > 10000))
        return Bad("Please check the prices.");
    p.Name = name;
    p.PricesJson = JsonSerializer.Serialize(req.Prices.Select(x => Math.Round(x, 2)));
    p.Hidden = req.Hidden;
    p.SoldOut = req.SoldOut;
    if (req.Stock is not null)
    {
        if (req.Stock.Length != p.Sizes.Length || req.Stock.Any(x => x is < 0 or > 100000)) return Bad("Please check the stock numbers.");
        p.Stock = req.Stock;
    }
    await db.SaveChangesAsync();
    return Results.Ok(ProductDto(p));
});

// ---------- Admin: discount codes ----------
admin.MapGet("/discounts", async (ShopDb db) =>
    (await db.DiscountCodes.AsNoTracking().OrderByDescending(d => d.CreatedAt).ToListAsync()).Select(DiscountDto));

admin.MapPost("/discounts", async (DiscountRequest req, ShopDb db) =>
{
    var code = (req.Code ?? "").Trim().ToUpperInvariant();
    if (!Regex.IsMatch(code, "^[A-Z0-9_-]{3,40}$")) return Bad("Use 3 to 40 letters or numbers for the code.");
    if (req.Kind is not ("percent" or "amount" or "freeship")) return Bad("Pick a discount type.");
    if (req.Kind == "percent" && req.Value is <= 0 or > 100) return Bad("A percentage must be between 1 and 100.");
    if (req.Kind == "amount" && req.Value is <= 0 or > 10000) return Bad("Please check the amount.");
    if (req.MinSubtotal < 0 || req.MaxUses is < 1) return Bad("Please check the limits.");
    var d = await db.DiscountCodes.FindAsync(code);
    if (d is null) db.DiscountCodes.Add(d = new DiscountCode { Code = code });
    d.Kind = req.Kind!; d.Value = req.Kind == "freeship" ? 0 : Math.Round(req.Value, 2);
    d.MinSubtotal = Math.Round(req.MinSubtotal, 2); d.MaxUses = req.MaxUses; d.Active = req.Active;
    await db.SaveChangesAsync();
    return Results.Ok(DiscountDto(d));
});

admin.MapDelete("/discounts/{code}", async (string code, ShopDb db) =>
    await db.DiscountCodes.Where(d => d.Code == code.ToUpperInvariant()).ExecuteDeleteAsync() > 0 ? Results.Ok() : Results.NotFound());

// ---------- Admin: reviews ----------
admin.MapGet("/reviews", async (ShopDb db) =>
    (await db.Reviews.AsNoTracking().OrderBy(r => r.Approved).ThenByDescending(r => r.CreatedAt).Take(500).ToListAsync()).Select(ReviewDto));

admin.MapPatch("/reviews/{id:int}", async (int id, ApproveRequest req, ShopDb db) =>
{
    var r = await db.Reviews.FindAsync(id);
    if (r is null) return Results.NotFound();
    r.Approved = req.Approved;
    await db.SaveChangesAsync();
    return Results.Ok(ReviewDto(r));
});

admin.MapDelete("/reviews/{id:int}", async (int id, ShopDb db) =>
    await db.Reviews.Where(r => r.Id == id).ExecuteDeleteAsync() > 0 ? Results.Ok() : Results.NotFound());

admin.MapGet("/subscribers", async (ShopDb db) =>
    (await db.Subscribers.AsNoTracking().OrderByDescending(s => s.CreatedAt).Take(5000).ToListAsync())
        .Select(s => new { id = s.Id, email = s.Email, source = s.Source, date = DateTime.SpecifyKind(s.CreatedAt, DateTimeKind.Utc) }));

admin.MapDelete("/subscribers/{id:int}", async (int id, ShopDb db) =>
    await db.Subscribers.Where(s => s.Id == id).ExecuteDeleteAsync() > 0 ? Results.Ok() : Results.NotFound());

admin.MapPost("/password", async (PasswordRequest req, ClaimsPrincipal u, ShopDb db) =>
{
    var user = await db.AdminUsers.FirstAsync(a => a.Username == u.Identity!.Name);
    var hasher = new PasswordHasher<AdminUser>();
    if (hasher.VerifyHashedPassword(user, user.PasswordHash, req.Current ?? "") == PasswordVerificationResult.Failed)
        return Bad("Your current password is not right.");
    if ((req.Next ?? "").Length < 8) return Bad("Use at least 8 characters for the new password.");
    user.PasswordHash = hasher.HashPassword(user, req.Next!);
    await db.SaveChangesAsync();
    return Results.Ok();
});

app.Run();

static string ClientIp(HttpContext http) => http.Connection.RemoteIpAddress?.ToString() ?? "unknown";

static string Trim(string? s, int max, string fallback)
{
    s = (s ?? "").Trim();
    return s.Length == 0 ? fallback : s.Length > max ? s[..max] : s;
}

record SubscribeRequest(string? Email, string? Source);
record OrderItem(string? Slug, int Size, int Qty);
record Customer(string? Email, string? FirstName, string? LastName, string? Address1, string? City, string? Postcode);
record Gift(bool Wrap, string? Message);
record OrderRequest(OrderItem[]? Items, Customer? Customer, Gift? Gift, string? DiscountCode);
record DiscountCheck(string? Code, decimal Subtotal);
record ReviewRequest(string? Slug, string? Name, int Rating, string? Text, string? OrderNo, string? Email);
record DiscountRequest(string? Code, string? Kind, decimal Value, decimal MinSubtotal, int? MaxUses, bool Active);
record ApproveRequest(bool Approved);
record LoginRequest(string? Username, string? Password);
record StatusRequest(string? Status, string? Tracking);
record ProductUpdate(string? Name, decimal[]? Prices, bool Hidden, bool SoldOut, int?[]? Stock);
record PasswordRequest(string? Current, string? Next);

public partial class Program;
