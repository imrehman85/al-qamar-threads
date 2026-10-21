using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Storage;

namespace AlQamar;

public class Product
{
    [Key, MaxLength(64)] public string Slug { get; set; } = "";
    [MaxLength(32)] public string Collection { get; set; } = "";
    [MaxLength(120)] public string Name { get; set; } = "";
    [MaxLength(40)] public string Colour { get; set; } = "";
    public string SizesJson { get; set; } = "[]";
    public string PricesJson { get; set; } = "[]";
    [MaxLength(64)] public string Img { get; set; } = "";
    public bool Hidden { get; set; }
    public bool SoldOut { get; set; }
    public int Sort { get; set; }
    // Units in stock per size; null means not tracked (unlimited).
    public string StockJson { get; set; } = "[]";

    public string[] Sizes => JsonSerializer.Deserialize<string[]>(SizesJson) ?? [];
    public decimal[] Prices => JsonSerializer.Deserialize<decimal[]>(PricesJson) ?? [];
    [NotMapped]
    public int?[] Stock
    {
        get
        {
            var raw = JsonSerializer.Deserialize<int?[]>(StockJson) ?? [];
            return Enumerable.Range(0, Sizes.Length).Select(i => i < raw.Length ? raw[i] : null).ToArray();
        }
        set => StockJson = JsonSerializer.Serialize(value);
    }
}

public class Order
{
    public int Id { get; set; }
    [MaxLength(20)] public string No { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    [MaxLength(20)] public string Status { get; set; } = "Awaiting payment";
    [MaxLength(120)] public string Name { get; set; } = "";
    [MaxLength(254)] public string Email { get; set; } = "";
    [MaxLength(300)] public string Address { get; set; } = "";
    public string ItemsJson { get; set; } = "[]";
    public decimal Subtotal { get; set; }
    public decimal Shipping { get; set; }
    public decimal Total { get; set; }
    public bool GiftWrap { get; set; }
    [MaxLength(200)] public string? GiftMessage { get; set; }
    [MaxLength(40)] public string? DiscountCode { get; set; }
    public decimal Discount { get; set; }
    [MaxLength(60)] public string? TrackingNumber { get; set; }
}

public class Review
{
    public int Id { get; set; }
    [MaxLength(64)] public string ProductSlug { get; set; } = "";
    [MaxLength(60)] public string Name { get; set; } = "";
    public int Rating { get; set; }
    [MaxLength(1000)] public string Text { get; set; } = "";
    [MaxLength(20)] public string? OrderNo { get; set; }
    public bool Approved { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class DiscountCode
{
    [Key, MaxLength(40)] public string Code { get; set; } = "";
    // "percent" (Value % off), "amount" (£Value off) or "freeship" (free delivery).
    [MaxLength(12)] public string Kind { get; set; } = "percent";
    public decimal Value { get; set; }
    public decimal MinSubtotal { get; set; }
    public bool Active { get; set; } = true;
    public int UsedCount { get; set; }
    public int? MaxUses { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Subscriber
{
    public int Id { get; set; }
    [MaxLength(254)] public string Email { get; set; } = "";
    [MaxLength(40)] public string Source { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class AdminUser
{
    public int Id { get; set; }
    [MaxLength(64)] public string Username { get; set; } = "";
    public string PasswordHash { get; set; } = "";
}

public record OrderLine(string Id, string Name, string Size, decimal Price, int Qty);

public class ShopDb(DbContextOptions<ShopDb> options) : DbContext(options)
{
    public DbSet<Product> Products => Set<Product>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<Subscriber> Subscribers => Set<Subscriber>();
    public DbSet<AdminUser> AdminUsers => Set<AdminUser>();
    public DbSet<Review> Reviews => Set<Review>();
    public DbSet<DiscountCode> DiscountCodes => Set<DiscountCode>();

    // Own schema, so the shop can share a database that already holds other tables.
    public const string Schema = "aqt";

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.HasDefaultSchema(Schema);
        b.Entity<Order>().HasIndex(o => o.No).IsUnique();
        b.Entity<Order>().HasIndex(o => o.CreatedAt);
        b.Entity<Subscriber>().HasIndex(s => s.Email).IsUnique();
        b.Entity<AdminUser>().HasIndex(a => a.Username).IsUnique();
        foreach (var p in new[] { "Subtotal", "Shipping", "Total", "Discount" })
            b.Entity<Order>().Property(p).HasPrecision(10, 2);
        b.Entity<Review>().HasIndex(r => r.ProductSlug);
        b.Entity<DiscountCode>().Property(d => d.Value).HasPrecision(10, 2);
        b.Entity<DiscountCode>().Property(d => d.MinSubtotal).HasPrecision(10, 2);
    }

    // Brings a database created by an earlier version up to date. Each step only adds what is
    // missing, so it is safe to run on every start and never touches existing data.
    static readonly string[] Upgrades =
    [
        "IF COL_LENGTH('aqt.Products','StockJson') IS NULL ALTER TABLE aqt.Products ADD StockJson nvarchar(max) NOT NULL CONSTRAINT DF_Products_StockJson DEFAULT N'[]'",
        "IF COL_LENGTH('aqt.Orders','GiftWrap') IS NULL ALTER TABLE aqt.Orders ADD GiftWrap bit NOT NULL CONSTRAINT DF_Orders_GiftWrap DEFAULT 0",
        "IF COL_LENGTH('aqt.Orders','GiftMessage') IS NULL ALTER TABLE aqt.Orders ADD GiftMessage nvarchar(200) NULL",
        "IF COL_LENGTH('aqt.Orders','DiscountCode') IS NULL ALTER TABLE aqt.Orders ADD DiscountCode nvarchar(40) NULL",
        "IF COL_LENGTH('aqt.Orders','Discount') IS NULL ALTER TABLE aqt.Orders ADD Discount decimal(10,2) NOT NULL CONSTRAINT DF_Orders_Discount DEFAULT 0",
        "IF COL_LENGTH('aqt.Orders','TrackingNumber') IS NULL ALTER TABLE aqt.Orders ADD TrackingNumber nvarchar(60) NULL",
        """
        IF OBJECT_ID('aqt.Reviews') IS NULL
        BEGIN
            CREATE TABLE aqt.Reviews (
                Id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Reviews PRIMARY KEY,
                ProductSlug nvarchar(64) NOT NULL, Name nvarchar(60) NOT NULL, Rating int NOT NULL,
                Text nvarchar(1000) NOT NULL, OrderNo nvarchar(20) NULL, Approved bit NOT NULL, CreatedAt datetime2 NOT NULL);
            CREATE INDEX IX_Reviews_ProductSlug ON aqt.Reviews (ProductSlug);
        END
        """,
        """
        IF OBJECT_ID('aqt.DiscountCodes') IS NULL
            CREATE TABLE aqt.DiscountCodes (
                Code nvarchar(40) NOT NULL CONSTRAINT PK_DiscountCodes PRIMARY KEY,
                Kind nvarchar(12) NOT NULL, Value decimal(10,2) NOT NULL, MinSubtotal decimal(10,2) NOT NULL,
                Active bit NOT NULL, UsedCount int NOT NULL, MaxUses int NULL, CreatedAt datetime2 NOT NULL)
        """
    ];

    // Creates the shop's tables on first run (even in a database that already has other tables)
    // and adds the starting catalogue and admin login.
    public static void Initialise(ShopDb db, IConfiguration config)
    {
        var creator = db.GetService<IRelationalDatabaseCreator>();
        if (!creator.Exists()) creator.Create();
        var tablesExist = db.Database
            .SqlQuery<int>($"SELECT COUNT(*) AS [Value] FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id WHERE s.name = {Schema} AND t.name = 'Products'")
            .Single() > 0;
        if (!tablesExist) creator.CreateTables();
        foreach (var sql in Upgrades) db.Database.ExecuteSqlRaw(sql);

        if (!db.Products.Any())
        {
            string[] towel = ["Hand towel 50 × 90 cm", "Bath towel 70 × 140 cm", "Bath sheet 90 × 160 cm"];
            string[] set = ["3-piece set"];
            db.Products.AddRange(
                NewProduct("moon-bath-towel", "moon", "Moon™ Bath Towel", "White", towel, [14, 24, 32], "1527986654082-0b5b3fef2632", 1),
                NewProduct("moon-towel-set", "moon", "Moon™ 3-Piece Towel Set", "White", set, [42], "1760722974657-f64bce2f9cc5", 2),
                NewProduct("dune-bath-towel", "dune", "Dune™ Bath Towel", "Apricot", towel, [14, 24, 32], "1664227431098-1289c13695c1", 3),
                NewProduct("dune-towel-set", "dune", "Dune™ 3-Piece Towel Set", "Apricot", set, [42], "1625479969471-c0a79753d2d3", 4));
        }

        if (!db.AdminUsers.Any())
        {
            var user = config["Admin:Username"] ?? "admin";
            var admin = new AdminUser { Username = user };
            admin.PasswordHash = new PasswordHasher<AdminUser>().HashPassword(admin, config["Admin:Password"] ?? "admin");
            db.AdminUsers.Add(admin);
        }
        db.SaveChanges();
    }

    static Product NewProduct(string slug, string col, string name, string colour, string[] sizes, decimal[] prices, string img, int sort) => new()
    {
        Slug = slug, Collection = col, Name = name, Colour = colour, Img = img, Sort = sort,
        SizesJson = JsonSerializer.Serialize(sizes), PricesJson = JsonSerializer.Serialize(prices)
    };
}
