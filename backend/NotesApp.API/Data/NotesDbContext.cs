using Microsoft.EntityFrameworkCore;
using NotesApp.API.Models;

namespace NotesApp.API.Data
{
    public class NotesDbContext : DbContext
    {
        public NotesDbContext(DbContextOptions<NotesDbContext> options) : base(options)
        {
        }

        public DbSet<User> Users { get; set; }
        public DbSet<Note> Notes { get; set; }
        public DbSet<Folder> Folders { get; set; }
        public DbSet<NoteShare> NoteShares { get; set; }
        public DbSet<Message> Messages { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Настройка индексов для производительности
            modelBuilder.Entity<User>()
                .HasIndex(u => u.Username)
                .IsUnique();

            modelBuilder.Entity<User>()
                .HasIndex(u => u.Email)
                .IsUnique();

            modelBuilder.Entity<Note>()
                .HasIndex(n => new { n.UserId, n.CreatedAt });

            modelBuilder.Entity<NoteShare>()
                .HasIndex(ns => new { ns.NoteId, ns.UserId })
                .IsUnique();

            modelBuilder.Entity<Message>()
                .HasIndex(m => new { m.NoteId, m.SentAt });

            // Настройка каскадного удаления
            modelBuilder.Entity<Note>()
                .HasOne(n => n.User)
                .WithMany(u => u.Notes)
                .HasForeignKey(n => n.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Folder>()
                .HasOne(f => f.User)
                .WithMany(u => u.Folders)
                .HasForeignKey(f => f.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<NoteShare>()
                .HasOne(ns => ns.Note)
                .WithMany(n => n.Shares)
                .HasForeignKey(ns => ns.NoteId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Message>()
                .HasOne(m => m.Note)
                .WithMany(n => n.Messages)
                .HasForeignKey(m => m.NoteId)
                .OnDelete(DeleteBehavior.Cascade);
        }
    }
}
