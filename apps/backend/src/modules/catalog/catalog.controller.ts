import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  Header,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import {
  CreateProductDto,
  UpdateProductDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateGalenicFormDto,
  UpdateProductPriceDto,
  ProductQueryDto,
  AddBarcodeDto,
} from './dto/catalog.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequirePermission } from '../auth/decorators/auth.decorators';

@ApiTags('Catalogue produits (CAT)')
@Controller('catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  // ==========================================
  // CAT-04 : CATÉGORIES ADMINISTRABLES
  // ==========================================

  @Get('categories')
  @RequirePermission('catalogue.consulter')
  @ApiOperation({ summary: 'Lister les catégories de produits (CAT-04)' })
  listCategories(@Req() req: any) {
    const pharmacyId = req.user?.pharmacyId || '11111111-1111-1111-1111-111111111111';
    return this.catalogService.listCategories(pharmacyId);
  }

  @Post('categories')
  @RequirePermission('catalogue.creer', 'catalogue.modifier')
  @ApiOperation({ summary: 'Créer une nouvelle catégorie (CAT-04)' })
  createCategory(@Body() dto: CreateCategoryDto, @Req() req: any) {
    const pharmacyId = req.user?.pharmacyId || '11111111-1111-1111-1111-111111111111';
    return this.catalogService.createCategory(dto, pharmacyId);
  }

  @Patch('categories/:id')
  @RequirePermission('catalogue.creer', 'catalogue.modifier')
  @ApiOperation({ summary: 'Modifier une catégorie existante (CAT-04)' })
updateCategory(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto, @Req() req: any) {
    const pharmacyId = req.user?.pharmacyId || '11111111-1111-1111-1111-111111111111';
    return this.catalogService.updateCategory(id, dto, pharmacyId);
  }

  @Delete('categories/:id')
  @RequirePermission('catalogue.creer', 'catalogue.modifier')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une catégorie sans produits associés (CAT-04)' })
deleteCategory(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const pharmacyId = req.user?.pharmacyId || '11111111-1111-1111-1111-111111111111';
    return this.catalogService.deleteCategory(id, pharmacyId);
  }

  // ==========================================
  // CAT-04 : FORMES GALÉNIQUES ADMINISTRABLES
  // ==========================================

  @Get('galenic-forms')
  @RequirePermission('catalogue.consulter')
  @ApiOperation({ summary: 'Lister les formes galéniques administrables (CAT-04)' })
  listGalenicForms(@Req() req: any) {
    const pharmacyId = req.user?.pharmacyId || '11111111-1111-1111-1111-111111111111';
    return this.catalogService.listGalenicForms(pharmacyId);
  }

  @Post('galenic-forms')
  @RequirePermission('catalogue.creer', 'catalogue.modifier')
  @ApiOperation({ summary: 'Ajouter une nouvelle forme galénique (CAT-04)' })
  createGalenicForm(@Body() dto: CreateGalenicFormDto, @Req() req: any) {
    const pharmacyId = req.user?.pharmacyId || '11111111-1111-1111-1111-111111111111';
    const authorId = req.user?.id;
    return this.catalogService.createGalenicForm(dto, pharmacyId, authorId);
  }

  // ==========================================
  // CAT-05 & PERF-01 : AUTOCOMPLÉTION & RECHERCHE
  // ==========================================

  @Get('autocomplete')
  @RequirePermission('catalogue.consulter')
  @ApiOperation({ summary: 'Autocomplétion ultra-légère pour la caisse (CAT-05, PERF-01)' })
  @ApiQuery({ name: 'q', required: true, description: 'Terme de recherche (nom, DCI, code-barres)' })
  autocomplete(@Query('q') query: string, @Req() req: any) {
    const pharmacyId = req.user?.pharmacyId || '11111111-1111-1111-1111-111111111111';
    return this.catalogService.autocomplete(query || '', pharmacyId);
  }

  @Get('products')
  @RequirePermission('catalogue.consulter')
  @ApiOperation({ summary: 'Recherche instantanée avec tolérance aux fautes et pagination (CAT-05, PERF-01)' })
  searchProducts(@Query() queryDto: ProductQueryDto, @Req() req: any) {
    const pharmacyId = req.user?.pharmacyId || '11111111-1111-1111-1111-111111111111';
    return this.catalogService.searchProducts(queryDto, pharmacyId);
  }

  @Get('products/:id')
  @RequirePermission('catalogue.consulter')
  @ApiOperation({ summary: 'Consulter la fiche détaillée d’un produit (CAT-01)' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  getProduct(
@Param('id', ParseUUIDPipe) id: string,
    @Query('includeInactive') includeInactive?: boolean,
    @Req() req?: any,
  ) {
    const pharmacyId = req?.user?.pharmacyId || '11111111-1111-1111-1111-111111111111';
    const shouldInclude = includeInactive === true || String(includeInactive) === 'true';
    return this.catalogService.getProductById(id, shouldInclude, pharmacyId);
  }

  @Post('products')
  @RequirePermission('catalogue.creer', 'catalogue.modifier')
  @ApiOperation({ summary: 'Créer une fiche produit complète (CAT-01, CAT-02, CAT-03)' })
  createProduct(@Body() dto: CreateProductDto, @Req() req: any) {
    const pharmacyId = req.user?.pharmacyId || '11111111-1111-1111-1111-111111111111';
    const authorId = req.user?.id;
    return this.catalogService.createProduct(dto, pharmacyId, authorId);
  }

  @Patch('products/:id')
  @RequirePermission('catalogue.creer', 'catalogue.modifier')
  @ApiOperation({ summary: 'Mettre à jour une fiche produit (CAT-01, CAT-02)' })
updateProduct(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto, @Req() req: any) {
    const pharmacyId = req.user?.pharmacyId || '11111111-1111-1111-1111-111111111111';
    const userId = req.user?.id;
    const permissions: string[] = req.user?.permissions || [];
    const hasPricePermission =
      req.user?.role === 'ADMIN' || permissions.includes('*') || permissions.includes('prix.modifier');
    return this.catalogService.updateProduct(id, dto, pharmacyId, userId, hasPricePermission);
  }

  // ==========================================
  // CAT-06 : GESTION DES PRIX & HISTORIQUE
  // ==========================================

  @Patch('products/:id/price')
  @RequirePermission('prix.modifier')
  @ApiOperation({ summary: 'Modifier le prix avec motif et historique obligatoire (CAT-06)' })
updatePrice(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductPriceDto, @Req() req: any) {
    const pharmacyId = req.user?.pharmacyId || '11111111-1111-1111-1111-111111111111';
    const userId = req.user?.id || 'admin-user-id';
    return this.catalogService.updatePrice(id, dto, userId, pharmacyId);
  }

  @Get('products/:id/price-history')
  @RequirePermission('catalogue.consulter')
  @ApiOperation({ summary: 'Historique audité des modifications de prix (CAT-06)' })
getPriceHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogService.getPriceHistory(id);
  }

  // ==========================================
  // CAT-03 : GESTION MULTI-CODES-BARRES
  // ==========================================

  @Post('products/:id/barcodes')
  @RequirePermission('catalogue.creer', 'catalogue.modifier')
  @ApiOperation({ summary: 'Associer un code-barres supplémentaire (CAT-03)' })
addBarcode(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddBarcodeDto, @Req() req: any) {
    const pharmacyId = req.user?.pharmacyId || '11111111-1111-1111-1111-111111111111';
    return this.catalogService.addBarcode(id, dto, pharmacyId);
  }

  @Delete('products/:id/barcodes/:barcodeId')
  @RequirePermission('catalogue.creer', 'catalogue.modifier')
  @ApiOperation({ summary: 'Supprimer un code-barres d’un produit (CAT-03)' })
  removeBarcode(
@Param('id', ParseUUIDPipe) id: string,
@Param('barcodeId', ParseUUIDPipe) barcodeId: string,
    @Req() req: any,
  ) {
    const pharmacyId = req.user?.pharmacyId || '11111111-1111-1111-1111-111111111111';
    return this.catalogService.removeBarcode(id, barcodeId, pharmacyId);
  }

  // ==========================================
  // CAT-08 : DÉSACTIVATION / RÉACTIVATION SANS SUPPRESSION (RG-06)
  // ==========================================

  @Patch('products/:id/deactivate')
  @RequirePermission('catalogue.creer', 'catalogue.modifier')
  @ApiOperation({ summary: 'Désactiver un produit sans perte d’historique (CAT-08, RG-06)' })
deactivateProduct(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const pharmacyId = req.user?.pharmacyId || '11111111-1111-1111-1111-111111111111';
    const authorId = req.user?.id;
    return this.catalogService.deactivateProduct(id, authorId, pharmacyId);
  }

  @Patch('products/:id/activate')
  @RequirePermission('catalogue.creer', 'catalogue.modifier')
  @ApiOperation({ summary: 'Réactiver un produit désactivé (CAT-08)' })
activateProduct(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const pharmacyId = req.user?.pharmacyId || '11111111-1111-1111-1111-111111111111';
    const authorId = req.user?.id;
    return this.catalogService.activateProduct(id, authorId, pharmacyId);
  }

  // ==========================================
  // CAT-07 : IMPORT / EXPORT CSV
  // ==========================================

  @Get('export-csv')
  @RequirePermission('catalogue.consulter')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="catalogue_produits.csv"')
  @ApiOperation({ summary: 'Exporter le catalogue sous format CSV (CAT-07)' })
  exportCsv(@Req() req: any) {
    const pharmacyId = req.user?.pharmacyId || '11111111-1111-1111-1111-111111111111';
    return this.catalogService.exportCsv(pharmacyId);
  }

  @Post('import/simulate')
  @RequirePermission('catalogue.creer', 'catalogue.modifier')
  @ApiOperation({ summary: 'Simuler l’importation d’un catalogue avec rapport d’erreurs (CAT-07)' })
  simulateImport(@Body('csvContent') csvContent: string, @Req() req: any) {
    const pharmacyId = req.user?.pharmacyId || '11111111-1111-1111-1111-111111111111';
    return this.catalogService.simulateImport(csvContent || '', pharmacyId);
  }

  @Post('import/execute')
  @RequirePermission('catalogue.creer', 'catalogue.modifier')
  @ApiOperation({ summary: 'Exécuter l’importation définitive du catalogue (CAT-07)' })
  executeImport(@Body('csvContent') csvContent: string, @Req() req: any) {
    const pharmacyId = req.user?.pharmacyId || '11111111-1111-1111-1111-111111111111';
    const authorId = req.user?.id;
    return this.catalogService.executeImport(csvContent || '', pharmacyId, authorId);
  }
}
