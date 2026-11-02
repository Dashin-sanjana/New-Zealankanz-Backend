import { IsString, MinLength } from 'class-validator';

export class AddWatchlistDto {
  @IsString()
  @MinLength(1)
  adId!: string;
}
