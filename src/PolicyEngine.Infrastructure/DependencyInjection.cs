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
        services.AddScoped<IBusinessRuleParser, BusinessRuleParser>();

        // Assess API proxy
        services.AddHttpClient("AssessAPI", client =>
        {
            var baseUrl = configuration["AssessApi:BaseUrl"]
                ?? throw new InvalidOperationException("AssessApi:BaseUrl is not configured");
            client.BaseAddress = new Uri(baseUrl);
            client.Timeout = TimeSpan.FromMinutes(3);
        })
        .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
        {
            // CRL servers are unreachable from inside Docker — skip revocation check,
            // but still fully validate the certificate chain itself.
            CheckCertificateRevocationList = false
        });

        // Configuration API proxy
        services.AddHttpClient("ConfigAPI", client =>
        {
            var baseUrl = configuration["ConfigApi:BaseUrl"]
                ?? throw new InvalidOperationException("ConfigApi:BaseUrl is not configured");
            client.BaseAddress = new Uri(baseUrl);
            client.Timeout = TimeSpan.FromMinutes(2);
        })
        .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
        {
            CheckCertificateRevocationList = false
        });

        // Decision API proxy
        services.AddHttpClient("DecisionAPI", client =>
        {
            var baseUrl = configuration["DecisionApi:BaseUrl"]
                ?? throw new InvalidOperationException("DecisionApi:BaseUrl is not configured");
            client.BaseAddress = new Uri(baseUrl);
            client.Timeout = TimeSpan.FromMinutes(2);
        })
        .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
        {
            CheckCertificateRevocationList = false
        });

        // RAG Services
        services.AddScoped<IEmbeddingService, OpenAiEmbeddingService>();
        services.AddScoped<IPolicyRetriever, PgVectorPolicyRetriever>();

        return services;
    }
}
