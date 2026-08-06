import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { AssignmentEngine } from '../assignments/assignment.engine';
import { ProcedureDetectorService } from '../webhook/procedure-detector.service';
import { NotesService } from '../notes/notes.service';

@Module({
  controllers: [LeadsController],
  providers: [LeadsService, AssignmentEngine, ProcedureDetectorService, NotesService],
  exports: [LeadsService],
})
export class LeadsModule {}
