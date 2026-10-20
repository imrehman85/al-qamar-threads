# Al Qamar Threads — online shop

A quiet-luxury towel shop with an admin dashboard, built as an **ASP.NET Core 8** app with an **MS SQL** database. Live at **https://alqamarthreads.somee.com** (free [somee.com](https://somee.com) hosting).

- **Shop:** Home, Shop, product pages, Bag, Checkout (bank transfer), Order confirmation, Our Story, Contact, Shipping & Returns, Terms, Privacy.
- **Admin** (`/admin.html`): orders and their status, product names, prices, visibility and sold-out flags, email sign-ups, and password change. The first login is `admin` / `admin`; change it under **Settings**.
- **Database:** tables (in their own `aqt` schema, so the database can be shared) and the four starting products are created automatically on first run.
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

To update just the app code on somee: upload an `app_offline.htm` first (this stops the app so its files can be replaced), upload the new `AlQamar.dll`, then delete `app_offline.htm`. The free SSL certificate lasts until 19 Dec 2026. Renew it under **SSL Certificates → Free certificate orders → Renew** before then.
