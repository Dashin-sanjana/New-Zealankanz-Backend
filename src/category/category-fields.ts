import { BadRequestException } from '@nestjs/common';

export type CategoryFieldType = 'text' | 'number' | 'select' | 'boolean';

export interface CategoryFieldDefinition {
  key: string;
  label: string;
  type: CategoryFieldType;
  required: boolean;
  filterable: boolean;
  options?: string[];
  min?: number;
  max?: number;
  unit?: string;
}

const fields: Record<string, CategoryFieldDefinition[]> = {
  motor: [
    {
      key: 'make',
      label: 'Make',
      type: 'text',
      required: true,
      filterable: true,
    },
    {
      key: 'model',
      label: 'Model',
      type: 'text',
      required: true,
      filterable: true,
    },
    {
      key: 'year',
      label: 'Year',
      type: 'number',
      required: false,
      filterable: true,
      min: 1900,
      max: new Date().getFullYear() + 1,
    },
    {
      key: 'mileage',
      label: 'Mileage',
      type: 'number',
      required: false,
      filterable: true,
      min: 0,
      unit: 'km',
    },
    {
      key: 'condition',
      label: 'Condition',
      type: 'select',
      required: true,
      filterable: true,
      options: ['New', 'Used', 'Parts only'],
    },
    {
      key: 'transmission',
      label: 'Transmission',
      type: 'select',
      required: false,
      filterable: true,
      options: ['Automatic', 'Manual', 'Other'],
    },
    {
      key: 'fuel',
      label: 'Fuel',
      type: 'select',
      required: false,
      filterable: true,
      options: ['Petrol', 'Diesel', 'Hybrid', 'Electric', 'Other'],
    },
    {
      key: 'bodyType',
      label: 'Body type',
      type: 'select',
      required: false,
      filterable: true,
      options: ['Hatchback', 'Sedan', 'SUV', 'Wagon', 'Ute', 'Van', 'Other'],
    },
  ],
  property: [
    {
      key: 'listingType',
      label: 'Sale or rent',
      type: 'select',
      required: false,
      filterable: true,
      options: ['Sale', 'Rent', 'Flatmates'],
    },
    {
      key: 'propertyType',
      label: 'Property type',
      type: 'select',
      required: false,
      filterable: true,
      options: ['House', 'Apartment', 'Townhouse', 'Section', 'Room', 'Other'],
    },
    {
      key: 'bedrooms',
      label: 'Bedrooms',
      type: 'number',
      required: false,
      filterable: true,
      min: 0,
      max: 30,
    },
    {
      key: 'bathrooms',
      label: 'Bathrooms',
      type: 'number',
      required: false,
      filterable: true,
      min: 0,
      max: 30,
    },
    {
      key: 'floorArea',
      label: 'Floor area',
      type: 'number',
      required: false,
      filterable: true,
      min: 0,
      unit: 'm²',
    },
    {
      key: 'landArea',
      label: 'Land area',
      type: 'number',
      required: false,
      filterable: true,
      min: 0,
      unit: 'm²',
    },
  ],
  electronics: [
    {
      key: 'brand',
      label: 'Brand',
      type: 'text',
      required: false,
      filterable: true,
    },
    {
      key: 'model',
      label: 'Model',
      type: 'text',
      required: false,
      filterable: true,
    },
    {
      key: 'condition',
      label: 'Condition',
      type: 'select',
      required: true,
      filterable: true,
      options: ['New', 'Used', 'For parts'],
    },
    {
      key: 'storage',
      label: 'Storage',
      type: 'text',
      required: false,
      filterable: true,
    },
    {
      key: 'specifications',
      label: 'Key specifications',
      type: 'text',
      required: false,
      filterable: false,
    },
  ],
  jobs: [
    {
      key: 'employmentType',
      label: 'Employment type',
      type: 'select',
      required: false,
      filterable: true,
      options: ['Full-time', 'Part-time', 'Casual', 'Contract', 'Fixed-term'],
    },
    {
      key: 'salaryMin',
      label: 'Salary from',
      type: 'number',
      required: false,
      filterable: true,
      min: 0,
      unit: 'NZD/year',
    },
    {
      key: 'salaryMax',
      label: 'Salary to',
      type: 'number',
      required: false,
      filterable: true,
      min: 0,
      unit: 'NZD/year',
    },
    {
      key: 'experience',
      label: 'Experience',
      type: 'select',
      required: false,
      filterable: true,
      options: ['Entry level', '1–3 years', '4–6 years', '7+ years'],
    },
    {
      key: 'workArrangement',
      label: 'Work arrangement',
      type: 'select',
      required: false,
      filterable: true,
      options: ['On-site', 'Hybrid', 'Remote'],
    },
  ],
  'home-living': [
    {
      key: 'condition',
      label: 'Condition',
      type: 'select',
      required: false,
      filterable: true,
      options: ['New', 'Used'],
    },
    {
      key: 'brand',
      label: 'Brand',
      type: 'text',
      required: false,
      filterable: true,
    },
    {
      key: 'material',
      label: 'Material',
      type: 'text',
      required: false,
      filterable: true,
    },
  ],
  services: [
    {
      key: 'serviceType',
      label: 'Service type',
      type: 'text',
      required: false,
      filterable: true,
    },
    {
      key: 'availability',
      label: 'Availability',
      type: 'select',
      required: false,
      filterable: true,
      options: ['Weekdays', 'Weekends', 'Evenings', 'Flexible'],
    },
  ],
  fashion: [
    {
      key: 'size',
      label: 'Size',
      type: 'text',
      required: false,
      filterable: true,
    },
    {
      key: 'condition',
      label: 'Condition',
      type: 'select',
      required: false,
      filterable: true,
      options: ['New', 'Like new', 'Used'],
    },
    {
      key: 'brand',
      label: 'Brand',
      type: 'text',
      required: false,
      filterable: true,
    },
  ],
  'sports-hobbies': [
    {
      key: 'itemType',
      label: 'Type',
      type: 'text',
      required: false,
      filterable: true,
    },
    {
      key: 'condition',
      label: 'Condition',
      type: 'select',
      required: false,
      filterable: true,
      options: ['New', 'Used'],
    },
  ],
  pets: [
    {
      key: 'species',
      label: 'Species',
      type: 'select',
      required: false,
      filterable: true,
      options: ['Dog', 'Cat', 'Bird', 'Fish', 'Other'],
    },
    {
      key: 'breed',
      label: 'Breed',
      type: 'text',
      required: false,
      filterable: true,
    },
    {
      key: 'age',
      label: 'Age',
      type: 'text',
      required: false,
      filterable: true,
    },
  ],
  'business-industrial': [
    {
      key: 'equipmentType',
      label: 'Equipment type',
      type: 'text',
      required: false,
      filterable: true,
    },
    {
      key: 'condition',
      label: 'Condition',
      type: 'select',
      required: false,
      filterable: true,
      options: ['New', 'Used', 'For parts'],
    },
  ],
};

export function getCategoryFields(slug: string): CategoryFieldDefinition[] {
  const family = slug === 'motors' ? 'motor' : slug;
  return fields[family] || [];
}

export function validateCategoryAttributes(
  slug: string,
  input: unknown,
): Record<string, string | number | boolean> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException('Listing attributes must be an object.');
  }
  const values = input as Record<string, unknown>;
  const definitions = getCategoryFields(slug);
  const known = new Map(definitions.map((field) => [field.key, field]));
  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(values)) {
    const field = known.get(key);
    if (!field)
      throw new BadRequestException(
        `The ${key} field is not supported for this category.`,
      );
    if (value === '' || value === null || value === undefined) continue;
    if (field.type === 'number') {
      const number = typeof value === 'number' ? value : Number(value);
      if (
        !Number.isFinite(number) ||
        (field.min !== undefined && number < field.min) ||
        (field.max !== undefined && number > field.max)
      ) {
        throw new BadRequestException(
          `${field.label} must be a valid number${field.min !== undefined ? ` of at least ${field.min}` : ''}${field.max !== undefined ? ` no greater than ${field.max}` : ''}.`,
        );
      }
      result[key] = number;
    } else if (field.type === 'boolean') {
      if (typeof value !== 'boolean')
        throw new BadRequestException(`${field.label} must be true or false.`);
      result[key] = value;
    } else {
      if (typeof value !== 'string' || value.length > 300)
        throw new BadRequestException(
          `${field.label} must be text of 300 characters or fewer.`,
        );
      if (field.type === 'select' && !field.options?.includes(value))
        throw new BadRequestException(
          `Choose a valid ${field.label.toLowerCase()}.`,
        );
      result[key] = value.trim();
    }
  }
  for (const field of definitions) {
    if (field.required && !result[field.key])
      throw new BadRequestException(
        `${field.label} is required for this category.`,
      );
  }
  return result;
}
