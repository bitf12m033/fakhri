import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { UserRole } from '@fakhri/prisma';
import { Roles } from '../auth/auth.decorators';
import { SearchDocumentService } from './search-document.service';

/**
 * Full search reindex. Mutations keep the document current on their own; this is
 * the escape hatch after a bulk import or a document-format change.
 * Open until RBAC lands in increment 3.4, like the rest of /admin.
 */
@Controller('admin/search')
@Roles(UserRole.CATALOG)
export class SearchIndexController {
  constructor(private readonly documents: SearchDocumentService) {}

  @Post('reindex')
  @HttpCode(HttpStatus.OK)
  async reindex() {
    return { data: { products: await this.documents.refreshAll() } };
  }
}
