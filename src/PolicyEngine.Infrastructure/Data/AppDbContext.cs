using Microsoft.EntityFrameworkCore;
using Pgvector.EntityFrameworkCore;
using PolicyEngine.Domain.Entities;

namespace PolicyEngine.Infrastructure.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<PolicyDocument> PolicyDocuments => Set<PolicyDocument>();
    public DbSet<Policy> Policies => Set<Policy>();
    public DbSet<PolicyVersion> PolicyVersions => Set<PolicyVersion>();
    public DbSet<EvaluationResult> EvaluationResults => Set<EvaluationResult>();
    public DbSet<EvaluationCheck> EvaluationChecks => Set<EvaluationCheck>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Enable pgvector extension
        modelBuilder.HasPostgresExtension("vector");

        // ── PolicyDocument ──
        modelBuilder.Entity<PolicyDocument>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.FileName).HasMaxLength(500).IsRequired();
            e.Property(x => x.Entity).HasMaxLength(200).IsRequired();
            e.Property(x => x.Version).HasMaxLength(100);
            e.HasMany(x => x.Policies)
             .WithOne(p => p.PolicyDocument)
             .HasForeignKey(p => p.PolicyDocumentId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        // ── Policy ──
        modelBuilder.Entity<Policy>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.Code).IsUnique();
            e.Property(x => x.Code).HasMaxLength(50).IsRequired();
            e.Property(x => x.Title).HasMaxLength(500).IsRequired();
            e.Property(x => x.Category).HasMaxLength(100).IsRequired();
            e.Property(x => x.Section).HasMaxLength(50);
            e.Property(x => x.Description).IsRequired();
            e.Property(x => x.Embedding)
             .HasColumnType("vector(1536)");
            e.HasIndex(x => x.Embedding)
             .HasMethod("ivfflat")
             .HasOperators("vector_cosine_ops")
             .HasStorageParameter("lists", 10);  // Tune for policy count: sqrt(N)
            e.HasMany(x => x.Versions)
             .WithOne(v => v.Policy)
             .HasForeignKey(v => v.PolicyId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        // ── PolicyVersion ──
        modelBuilder.Entity<PolicyVersion>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.ChangedBy).HasMaxLength(200);
            e.Property(x => x.ChangeReason).HasMaxLength(500);
        });

        // ── EvaluationResult ──
        modelBuilder.Entity<EvaluationResult>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.OriginalFileName).HasMaxLength(500);
            e.Property(x => x.ApplicationDataJson).HasColumnType("jsonb");
            e.Property(x => x.RawAiResponseJson).HasColumnType("jsonb");
            e.Property(x => x.Summary).HasMaxLength(2000);
            e.Property(x => x.ModelUsed).HasMaxLength(100);
            e.Property(x => x.Verdict).HasConversion<string>().HasMaxLength(50);
            e.HasOne(x => x.PolicyDocument)
             .WithMany(d => d.EvaluationResults)
             .HasForeignKey(x => x.PolicyDocumentId)
             .OnDelete(DeleteBehavior.SetNull);
            e.HasMany(x => x.Checks)
             .WithOne(c => c.EvaluationResult)
             .HasForeignKey(c => c.EvaluationResultId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        // ── EvaluationCheck ──
        modelBuilder.Entity<EvaluationCheck>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.PolicyCode).HasMaxLength(50);
            e.Property(x => x.PolicyTitle).HasMaxLength(500);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.Reason).HasMaxLength(2000);
            e.Property(x => x.SubmittedValue).HasMaxLength(500);
            e.Property(x => x.RequiredValue).HasMaxLength(500);
        });
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        foreach (var entry in ChangeTracker.Entries<BaseEntity>())
        {
            if (entry.State == EntityState.Modified)
                entry.Entity.UpdatedAt = DateTime.UtcNow;
        }
        return base.SaveChangesAsync(cancellationToken);
    }
}
