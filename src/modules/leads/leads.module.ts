import { Module, forwardRef } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { OperatorsModule } from '../operators/operators.module';
import { WebSocketModule } from '../websocket/websocket.module';

@Module({
  imports: [
    forwardRef(() => OperatorsModule),
    forwardRef(() => WebSocketModule),
  ],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
