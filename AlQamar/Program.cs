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

// Somee's free hosting appends an ad script after every HTML response, past its Content-Length.
// On a reused keep-alive connection those extra bytes corrupt the next response and the browser
// shows a blank page until a refresh. Closing the connection after HTML responses discards them.
app.Use((ctx, next) =>
{
    ctx.Response.OnStarting(() =>
    {
        if (ctx.Response.ContentType?.StartsWith("text/html", StringComparison.OrdinalIgnoreCase) == true)
            ctx.Response.Headers.Connection = "close";
        return Task.CompletedTask;
    });
    return next();
});

app.UseStatusCodePagesWithReExecute("/404.html");
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
    sizes = p.Sizes, prices = p.Prices, img = p.Img, hidden = p.Hidden, soldOut = p.SoldOut
};
object OrderDto(Order o) => new
{
    no = o.No, date = DateTime.SpecifyKind(o.CreatedAt, DateTimeKind.Utc), status = o.Status, name = o.Name, email = o.Email,
    address = o.Address, items = JsonSerializer.Deserialize<OrderLine[]>(o.ItemsJson, webJson),
    totals = new { sub = o.Subtotal, ship = o.Shipping, total = o.Total }
};
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

    var products = await db.Products.AsNoTracking().ToDictionaryAsync(p => p.Slug);
    var lines = new Dictionary<string, OrderLine>();
    foreach (var it in req.Items)
    {
        if (it.Slug is null || !products.TryGetValue(it.Slug, out var p) || it.Size < 0 || it.Size >= p.Sizes.Length)
            return Bad("An item in your bag is no longer available.");
        if (it.Qty < 1) return Bad("Please check the quantities in your bag.");
        if (p.Hidden || p.SoldOut) return Results.Conflict(new { error = $"{p.Name} is sold out. Please remove it from your bag." });
        var key = $"{p.Slug}:{it.Size}";
        var qty = Math.Min(MaxQty, (lines.TryGetValue(key, out var prev) ? prev.Qty : 0) + it.Qty);
        lines[key] = new OrderLine(p.Slug, p.Name, p.Sizes[it.Size], p.Prices[it.Size], qty);
    }

    var items = lines.Values.ToArray();
    var subtotal = items.Sum(l => l.Price * l.Qty);
    var ship = subtotal >= FreeOver ? 0 : Shipping;
    var order = new Order
    {
        Name = Trim($"{c.FirstName} {c.LastName}", 120, ""), Email = email,
        Address = Trim(string.Join(", ", new[] { c.Address1, c.City, c.Postcode }.Select(x => x!.Trim())), 300, ""),
        ItemsJson = JsonSerializer.Serialize(items, webJson),
        Subtotal = subtotal, Shipping = ship, Total = subtotal + ship, No = "pending-" + Guid.NewGuid().ToString("N")[..10]
    };
    db.Orders.Add(order);
    await db.SaveChangesAsync();
    order.No = "AQT-" + (10000 + order.Id);
    await db.SaveChangesAsync();
    return Results.Ok(OrderDto(order));
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
    o.Status = req.Status!;
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
    await db.SaveChangesAsync();
    return Results.Ok(ProductDto(p));
});

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
record OrderRequest(OrderItem[]? Items, Customer? Customer);
record LoginRequest(string? Username, string? Password);
record StatusRequest(string? Status);
record ProductUpdate(string? Name, decimal[]? Prices, bool Hidden, bool SoldOut);
record PasswordRequest(string? Current, string? Next);

public partial class Program;
