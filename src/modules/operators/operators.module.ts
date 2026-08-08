import { Module, forwardRef } from '@nestjs/common';
import { OperatorsController } from './operators.controller';
import { OperatorsService } from './operators.service';
import { LeadsModule } from '../leads/leads.module';

@Module({
  imports: [forwardRef(() => LeadsModule)],
  controllers: [OperatorsController],
  providers: [OperatorsService],
  exports: [OperatorsService],
})
export class OperatorsModule {}
