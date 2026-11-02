import { IsString, IsNotEmpty, MinLength, IsEmail, IsOptional, IsEnum, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { RoleName } from '@vhp/shared';

export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{10,}$/;
export const PASSWORD_POLICY_MESSAGE =
  'Le mot de passe doit comporter au moins 10 caractères, incluant au moins une majuscule, une minuscule, un chiffre et un caractère spécial (AUT-02, SEC-02).';

export class LoginDto {
  @ApiProperty({ example: 'admin', description: 'Nom d’utilisateur' })
  @IsString()
  @IsNotEmpty({ message: 'L’identifiant est obligatoire.' })
  username: string;

  @ApiProperty({ example: 'Admin2026@VoiciLHomme!', description: 'Mot de passe (10 caractères minimum selon AUT-02)' })
  @IsString()
  @MinLength(10, { message: 'Le mot de passe doit comporter au moins 10 caractères (AUT-02).' })
  password: string;
}

export class CreateUserDto {
  @ApiProperty({ example: 'j.kouame', description: 'Identifiant unique' })
  @IsString()
  @IsNotEmpty({ message: 'L’identifiant est obligatoire.' })
  username: string;

  @ApiProperty({ example: 'Jean Kouamé', description: 'Nom complet de l’utilisateur' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom complet est obligatoire.' })
  fullName: string;

  @ApiProperty({ example: 'j.kouame@voicilhomme.cd', description: 'Adresse email professionnelle' })
  @IsEmail({}, { message: 'Adresse email invalide.' })
  @IsOptional()
  email?: string;

  @ApiProperty({ example: 'SecretP@ssw0rd2026!', description: 'Mot de passe conforme à la politique de sécurité' })
  @IsString()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_POLICY_MESSAGE })
  password: string;

  @ApiProperty({ example: 'CAISSIER', enum: ['ADMIN', 'PHARMACIEN', 'CAISSIER', 'STOCK', 'COMPTABLE'] })
  @IsEnum(['ADMIN', 'PHARMACIEN', 'CAISSIER', 'STOCK', 'COMPTABLE'], {
    message: 'Rôle invalide. Choisissez parmi : ADMIN, PHARMACIEN, CAISSIER, STOCK, COMPTABLE.',
  })
  role: RoleName;

  @ApiProperty({ example: '1234', description: 'Code PIN à 4 chiffres pour actions sensibles (AUT-08)' })
  @IsString()
  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'Le code PIN doit comporter exactement 4 chiffres.' })
  pinCode?: string;
}

export class UpdateUserDto {
  @ApiProperty({ example: 'Jean Kouamé Modifié', required: false })
  @IsString()
  @IsOptional()
  fullName?: string;

  @ApiProperty({ example: 'j.kouame.updated@voicilhomme.cd', required: false })
  @IsEmail({}, { message: 'Adresse email invalide.' })
  @IsOptional()
  email?: string;

  @ApiProperty({ example: 'PHARMACIEN', enum: ['ADMIN', 'PHARMACIEN', 'CAISSIER', 'STOCK', 'COMPTABLE'], required: false })
  @IsEnum(['ADMIN', 'PHARMACIEN', 'CAISSIER', 'STOCK', 'COMPTABLE'])
  @IsOptional()
  role?: RoleName;

  @ApiProperty({ example: '5678', description: 'Nouveau code PIN à 4 chiffres', required: false })
  @IsString()
  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'Le code PIN doit comporter exactement 4 chiffres.' })
  pinCode?: string;
}

export class VerifyPinDto {
  @ApiProperty({ example: '9999', description: 'Code PIN à 4 chiffres du superviseur' })
  @IsString()
  @IsNotEmpty({ message: 'Le code PIN est requis.' })
  @Matches(/^\d{4}$/, { message: 'Le code PIN doit comporter exactement 4 chiffres.' })
  pinCode: string;

  @ApiProperty({ example: 'ANNULATION_VENTE', description: 'Action sensible requérant le PIN' })
  @IsString()
  @IsNotEmpty({ message: 'L’action sensible doit être spécifiée.' })
  action: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'NouveauMdpFort2026@!' })
  @IsString()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_POLICY_MESSAGE })
  newPassword: string;
}

export class ChangeMyPasswordDto {
  @ApiProperty({ example: 'AncienMdp2026@!' })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ example: 'NouveauMdpFort2026@!' })
  @IsString()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_POLICY_MESSAGE })
  newPassword: string;
}

export class ChangeMyPinDto {
  @ApiProperty({ example: '1234', description: 'Code PIN actuel à 4 chiffres', required: false })
  @IsString()
  @IsOptional()
  currentPin?: string;

  @ApiProperty({ example: '5678', description: 'Nouveau code PIN à 4 chiffres' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}$/, { message: 'Le nouveau code PIN doit comporter exactement 4 chiffres.' })
  newPin: string;
}
