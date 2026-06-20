import { Controller, Get, Header } from '@nestjs/common';
import { SeoService } from './seo.service';

@Controller('seo')
export class SeoController {
  constructor(private readonly seo: SeoService) {}

  @Get('sitemap')
  @Header('Content-Type', 'application/xml')
  sitemap() {
    return this.seo.sitemap();
  }
}
