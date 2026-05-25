using System.ComponentModel.DataAnnotations;

namespace NotesApp.API.Models.Auth;

public class ConfirmEmailDto
{
    [Required]
    [StringLength(6, MinimumLength = 6)]
    [RegularExpression(@"^\d{6}$", ErrorMessage = "Код должен состоять из 6 цифр")]
    public string Code { get; set; } = string.Empty;
}
