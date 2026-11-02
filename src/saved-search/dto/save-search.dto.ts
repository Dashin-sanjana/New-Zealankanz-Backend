import { IsObject, IsString, MaxLength, MinLength } from 'class-validator';

export class SaveSearchDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @IsObject()
  query!: Record<string, unknown>;
}
