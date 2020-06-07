import { Module } from '@nestjs/common';

import { ExceptionFiltersModule } from 'src/filters/exceptionFilters.module';

import { AccountModule } from './account/account.module';
import { OrganizationModule } from './organization/organization.module';
import { AppModule } from './app/app.module';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { EntityModule } from './entity/entity.module';
import { EntityFieldModule } from './entityField/entityField.module';
import { PermissionsModule } from './permissions/permissions.module';
import { ConnectorRestApiModule } from './connectorRestApi/connectorRestApi.module';

@Module({
  imports: [
    AccountModule,
    OrganizationModule,
    AppModule,
    UserModule,
    AuthModule,
    EntityModule,
    EntityFieldModule,
    PermissionsModule,
    ExceptionFiltersModule,
    ConnectorRestApiModule
  ],
  providers: [],
  exports: [
    AccountModule,
    OrganizationModule,
    AppModule,
    UserModule,
    AuthModule,
    EntityModule,
    EntityFieldModule,
    PermissionsModule,
    ConnectorRestApiModule
  ]
})
export class CoreModule {}