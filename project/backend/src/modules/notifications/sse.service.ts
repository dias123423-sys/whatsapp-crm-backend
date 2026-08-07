import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';

export interface SseEvent {
  type: 'new_lead' | 'lead_updated' | 'stats_updated';
  data: any;
}

@Injectable()
export class SseService {
  private readonly logger = new Logger(SseService.name);

  // All admin subscribers listen on this single subject
  private readonly events$ = new Subject<SseEvent>();

  /** Returns an Observable that every SSE controller subscriber gets */
  getStream() {
    return this.events$.asObservable();
  }

  emit(event: SseEvent) {
    this.logger.debug(`SSE emit: ${event.type}`);
    this.events$.next(event);
  }
}
