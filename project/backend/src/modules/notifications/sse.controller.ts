import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { SseService } from './sse.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('sse')
@ApiBearerAuth()
@Controller('sse')
export class SseController {
  constructor(private sseService: SseService) {}

  /**
   * GET /sse/events
   * Admin dashboard connects here to receive real-time lead notifications.
   * Uses native HTTP chunked transfer — no extra libraries required on client.
   *
   * Because the JWT token cannot be sent as a header by the browser's
   * EventSource API, we accept it as a query parameter: ?token=<jwt>
   * The JwtAuthGuard is NOT applied here; auth is handled manually below.
   */
  @Get('events')
  @ApiOperation({ summary: 'Server-Sent Events stream for real-time lead updates' })
  stream(@Req() req: Request, @Res() res: Response) {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
    res.flushHeaders();

    // Send a heartbeat immediately so the browser knows the connection is open
    res.write(': heartbeat\n\n');

    // Subscribe to the shared event stream
    const subscription = this.sseService.getStream().subscribe({
      next: (event) => {
        try {
          res.write(`event: ${event.type}\n`);
          res.write(`data: ${JSON.stringify(event.data)}\n\n`);
        } catch {
          // client disconnected — will be cleaned up below
        }
      },
    });

    // Keep-alive ping every 25 seconds (browsers time out at ~30s)
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 25_000);

    // Clean up when the client disconnects
    req.on('close', () => {
      clearInterval(heartbeat);
      subscription.unsubscribe();
    });
  }
}
