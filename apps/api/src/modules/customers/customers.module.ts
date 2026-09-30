import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { AddressesService } from './addresses.service';
import { CustomerAuthController } from './customer-auth.controller';
import { CustomerAuthService } from './customer-auth.service';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { OtpService } from './otp.service';
import { WishlistService } from './wishlist.service';

/**
 * Customer accounts, OTP login, addresses and wishlist (increment 3.4).
 * Imports the catalog module for the storefront product projection the wishlist shows.
 */
@Module({
  imports: [CatalogModule],
  controllers: [CustomerAuthController, CustomersController],
  providers: [CustomerAuthService, CustomersService, AddressesService, WishlistService, OtpService],
})
export class CustomersModule {}
