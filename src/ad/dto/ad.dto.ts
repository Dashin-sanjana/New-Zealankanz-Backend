import { AdStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBooleanString,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsInt,
  IsOptional,
  IsString,
  IsObject,
  MaxLength,
  MinLength,
  Min,
} from 'class-validator';

export enum AdSort {
  NEWEST = 'newest',
  OLDEST = 'oldest',
  PRICE_ASC = 'price_asc',
  PRICE_DESC = 'price_desc',
}

export class UpsertAdDto {
  @IsString()
  @MinLength(3)
  title!: string;

  @IsString()
  @MinLength(10)
  description!: string;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsString()
  categoryId!: string;

  @IsString()
  locationId!: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value as unknown;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value as unknown;
    }
  })
  @IsObject()
  attributes?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;
}

export class AdQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  keyword?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  subcategory?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsEnum(AdStatus)
  status?: AdStatus;

  @IsOptional()
  @IsBooleanString()
  featured?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @IsString()
  priceCurrency?: string;

  @IsOptional()
  @IsEnum(AdSort)
  sort?: AdSort;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  attributes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class RejectAdDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
