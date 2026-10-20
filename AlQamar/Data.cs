using System.ComponentModel.DataAnnotations;
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

    public string[] Sizes => JsonSerializer.Deserialize<string[]>(SizesJson) ?? [];
    public decimal[] Prices => JsonSerializer.Deserialize<decimal[]>(PricesJson) ?? [];
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

    // Own schema, so the shop can share a database that already holds other tables.
    public const string Schema = "aqt";

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.HasDefaultSchema(Schema);
        b.Entity<Order>().HasIndex(o => o.No).IsUnique();
        b.Entity<Order>().HasIndex(o => o.CreatedAt);
        b.Entity<Subscriber>().HasIndex(s => s.Email).IsUnique();
        b.Entity<AdminUser>().HasIndex(a => a.Username).IsUnique();
        foreach (var p in new[] { "Subtotal", "Shipping", "Total" })
            b.Entity<Order>().Property(p).HasPrecision(10, 2);
    }

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
