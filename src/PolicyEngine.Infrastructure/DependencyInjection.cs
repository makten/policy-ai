using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using PolicyEngine.Application.Interfaces;
using PolicyEngine.Infrastructure.Data;
using PolicyEngine.Infrastructure.Repositories;
using PolicyEngine.Infrastructure.Services;

namespace PolicyEngine.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        // Database
        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? "Host=localhost;Database=policy_engine;Username=postgres;Password=postgres";

        services.AddDbContext<AppDbContext>(options =>
            options.UseNpgsql(connectionString, npgsql =>
            {
                npgsql.MigrationsAssembly(typeof(AppDbContext).Assembly.FullName);
                npgsql.UseVector();
            }));

        // Repositories
        services.AddScoped<IPolicyRepository, PolicyRepository>();
        services.AddScoped<IEvaluationRepository, EvaluationRepository>();

        // AI Provider
        services.AddHttpClient("OpenAI", client =>
        {
            client.Timeout = TimeSpan.FromMinutes(10);
        });
        services.AddScoped<IEvaluationProvider, OpenAiEvaluationProvider>();
        services.AddScoped<IPolicyFileParser, PdfPolicyParser>();

        // RAG Services
        services.AddScoped<IEmbeddingService, OpenAiEmbeddingService>();
        services.AddScoped<IPolicyRetriever, PgVectorPolicyRetriever>();

        return services;
    }
}
