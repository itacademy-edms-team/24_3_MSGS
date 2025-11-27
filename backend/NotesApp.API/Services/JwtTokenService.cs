using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using NotesApp.API.Models;
using NotesApp.API.Options;

namespace NotesApp.API.Services
{
    public class JwtTokenService : ITokenService
    {
        private readonly JwtSettings _jwtSettings;
        private readonly SigningCredentials _signingCredentials;

        public JwtTokenService(IOptions<JwtSettings> jwtOptions)
        {
            _jwtSettings = jwtOptions.Value;
            var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtSettings.SecretKey));
            _signingCredentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);
        }

        public string GenerateAccessToken(User user)
        {
            var claims = new List<Claim>
            {
                new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
                new Claim(JwtRegisteredClaimNames.UniqueName, user.Username),
                new Claim(JwtRegisteredClaimNames.Email, user.Email),
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Name, user.Username)
            };

            var jwtToken = new JwtSecurityToken(
                issuer: _jwtSettings.Issuer,
                audience: _jwtSettings.Audience,
                claims: claims,
                notBefore: DateTime.UtcNow,
                expires: DateTime.UtcNow.AddMinutes(_jwtSettings.AccessTokenLifetimeMinutes),
                signingCredentials: _signingCredentials);

            return new JwtSecurityTokenHandler().WriteToken(jwtToken);
        }
    }
}

