import { BadRequestException } from '@nestjs/common';
import {
  getCategoryFields,
  validateCategoryAttributes,
} from './category-fields';

describe('category field registry', () => {
  it('exposes filterable NZ motor fields and validates required fields', () => {
    expect(getCategoryFields('motor').map(({ key }) => key)).toContain(
      'mileage',
    );
    expect(() =>
      validateCategoryAttributes('motor', { make: 'Toyota' }),
    ).toThrow('Model is required');
    expect(
      validateCategoryAttributes('motor', {
        make: ' Toyota ',
        model: 'Aqua',
        condition: 'Used',
        year: 2022,
        mileage: 45000,
      }),
    ).toEqual({
      make: 'Toyota',
      model: 'Aqua',
      condition: 'Used',
      year: 2022,
      mileage: 45000,
    });
  });

  it('rejects values outside configured options and unsupported fields', () => {
    expect(() =>
      validateCategoryAttributes('electronics', { condition: 'Broken' }),
    ).toThrow(BadRequestException);
    expect(() =>
      validateCategoryAttributes('property', { engineSize: 2 }),
    ).toThrow(BadRequestException);
  });

  it('provides category-specific numeric filters for property and employment', () => {
    expect(
      getCategoryFields('property').find(({ key }) => key === 'bedrooms'),
    ).toMatchObject({ type: 'number', filterable: true });
    expect(
      getCategoryFields('jobs').find(({ key }) => key === 'salaryMin'),
    ).toMatchObject({ unit: 'NZD/year', filterable: true });
  });
});
