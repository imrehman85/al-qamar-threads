# Al Qamar Threads — online shop

A quiet-luxury towel shop with an admin dashboard, built as an **ASP.NET Core 8** app with an **MS SQL** database. Made to run on free [somee.com](https://somee.com) hosting.

- **Shop:** Home, Shop, product pages, Bag, Checkout (bank transfer), Order confirmation, Our Story, Contact, Shipping & Returns, Terms, Privacy.
- **Admin** (`/admin.html`): orders and their status, product names, prices, visibility and sold-out flags, email sign-ups, and password change. The first login is `admin` / `admin`; change it under **Settings**.
- **Database:** tables and the four starting products are created automatically on first run.
- Photos are free-licence samples from Unsplash, to be swapped for Al Qamar's own product shots.

## Project layout

| Path | What it is |
|---|---|
| `AlQamar/Program.cs` | API: products, sign-ups, orders, admin login and admin actions |
| `AlQamar/Data.cs` | Database tables and first-run setup |
| `AlQamar/wwwroot/` | The website (HTML, CSS, JS) |
| `build.py` | Regenerates the HTML pages into `AlQamar/wwwroot` |

## Run locally

Needs the .NET 8 SDK and SQL Server LocalDB.

```bash
dotnet run --project AlQamar --urls http://localhost:5080
```

## Deploy to somee.com

```bash
dotnet publish AlQamar -c Release -o publish
```

Zip the contents of `publish/` and upload it to the site root in the somee File Manager. Then put the somee database connection string in `appsettings.Production.json`. Open `/api/health` to check the database is connected.
