import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { EventBusService } from './event-bus.service';

/**
 * Domain event infrastructure (W0-E2-S1). Global so services can inject
 * EventBusService without importing this module everywhere.
 */
@Global()
@Module({
  imports: [
    EventEmitterModule.forRoot({
      // '.'-delimited wildcards let the audit module (W0-E3) subscribe to '**'.
      wildcard: true,
      delimiter: '.',
      // Bound the fan-out; raise deliberately if a legit 11th subscriber appears.
      maxListeners: 10,
      verboseMemoryLeak: true,
    }),
  ],
  providers: [EventBusService],
  exports: [EventBusService],
})
export class EventsModule {}
