import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthKeepAliveService } from './health-keep-alive.service';

@Module({
  controllers: [HealthController],
  providers: [HealthKeepAliveService],
})
export class HealthModule {}
