using System.Text.Json;
using System.Text.Json.Serialization;
using PolicyEngine.API.Services;
using PolicyEngine.Infrastructure;
using PolicyEngine.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

// Allow long-running PDF extraction requests (up to 10 minutes)
builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.KeepAliveTimeout = TimeSpan.FromMinutes(10);
    options.Limits.RequestHeadersTimeout = TimeSpan.FromMinutes(10);
});

// ── Services ──
builder.Services.AddControllers()
    .AddJsonOptions(opts =>
    {
        opts.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        opts.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
        opts.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    });

builder.Services.AddOpenApi();

// CORS for Next.js frontend
builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        policy.WithOrigins(
                  "http://localhost:3000",
                  "https://localhost:3000",
                  "http://web:3000")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// Infrastructure (EF Core, Repositories, AI Provider)
builder.Services.AddInfrastructure(builder.Configuration);

// Background upload job service (singleton — survives across requests)
builder.Services.AddSingleton<UploadJobService>();

var app = builder.Build();

// ── Middleware Pipeline ──

// Global exception handler
app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        context.Response.StatusCode = 500;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsJsonAsync(new { message = "An unexpected error occurred." });
    });
});

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference(options =>
    {
        options
            .WithTitle("Policy Validation Engine API")
            .WithDefaultHttpClient(ScalarTarget.CSharp, ScalarClient.HttpClient);
    });
}

app.UseHttpsRedirection();
app.UseCors("Frontend");
app.MapControllers();

// Auto-migrate database in development
if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.EnsureCreatedAsync();

    // Apply incremental schema changes not covered by EnsureCreated
    await db.Database.ExecuteSqlRawAsync("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'PolicyDocuments' AND column_name = 'ContentHash'
            ) THEN
                ALTER TABLE "PolicyDocuments" ADD COLUMN "ContentHash" character varying(64);
                CREATE INDEX "IX_PolicyDocuments_ContentHash" ON "PolicyDocuments" ("ContentHash");
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'EvaluationChecks' AND column_name = 'Reasoning'
            ) THEN
                ALTER TABLE "EvaluationChecks" ADD COLUMN "Reasoning" character varying(4000) NOT NULL DEFAULT '';
            END IF;
        END $$;
        """);
}

app.Run();

record WeatherForecast(DateOnly Date, int TemperatureC, string? Summary)
{
    public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);
}
