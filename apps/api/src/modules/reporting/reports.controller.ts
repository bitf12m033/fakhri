import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { UserRole } from '@fakhri/prisma';
import { Roles } from '../auth/auth.decorators';
import { LowStockDto, SalesReportDto, TopProductsDto } from './reports.dto';
import { ReportsService } from './reports.service';

@Controller('admin/reports')
@Roles(UserRole.ORDERS)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('sales')
  async sales(@Query() query: SalesReportDto, @Res({ passthrough: true }) res: Response) {
    const rows = await this.reports.salesByDay(query);
    if (query.format === 'csv') return csv(res, 'sales', this.reports.salesCsv(rows));
    return { data: rows };
  }

  @Get('top-products')
  async topProducts(@Query() query: TopProductsDto, @Res({ passthrough: true }) res: Response) {
    const rows = await this.reports.topProducts(query);
    if (query.format === 'csv') return csv(res, 'top-products', this.reports.topProductsCsv(rows));
    return { data: rows };
  }

  @Get('low-stock')
  async lowStock(@Query() query: LowStockDto, @Res({ passthrough: true }) res: Response) {
    const rows = await this.reports.lowStock(query);
    if (query.format === 'csv') return csv(res, 'low-stock', this.reports.lowStockCsv(rows));
    return { data: rows };
  }

  @Get('cod-outstanding')
  async codOutstanding(
    @Query() query: { format?: 'json' | 'csv' },
    @Res({ passthrough: true }) res: Response,
  ) {
    const rows = await this.reports.codOutstanding();
    if (query.format === 'csv') return csv(res, 'cod-outstanding', this.reports.codOutstandingCsv(rows));
    return { data: rows };
  }
}

/** Send the file itself rather than the usual envelope: this is a download. */
function csv(res: Response, name: string, body: string): void {
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="fakhri-${name}-${stamp}.csv"`);
  res.send(body);
}
