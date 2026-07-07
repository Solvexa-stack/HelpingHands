import { ActorContext } from './actor-context';

/**
 * Event name convention: `noun.verb-past`, lowercase snake/kebab —
 * e.g. `project.created`, `study_section.assigned`, `voting.closed`.
 */
export const EVENT_NAME_PATTERN = /^[a-z][a-z_]*\.[a-z][a-z_-]*$/;

export interface DomainEventSubject {
  /** Entity type in snake_case, e.g. 'project', 'study_section'. */
  type: string;
  id: number | string;
}

/** The envelope every domain event is delivered in. */
export interface DomainEvent<TData = Record<string, unknown>> {
  event: string;
  /** Payload schema version; bump when the shape of `data` changes. */
  version: number;
  actor: ActorContext;
  subject: DomainEventSubject;
  data: TData;
  /** Copied from actor.requestId for envelope-level correlation. */
  requestId: string;
  /** ISO timestamp; for buffered events this is when the fact happened, not when it was emitted. */
  occurredAt: string;
}

/** Input to publish/buffer an event; envelope bookkeeping is filled in by the bus. */
export interface DomainEventInput<TData = Record<string, unknown>> {
  event: string;
  actor: ActorContext;
  subject: DomainEventSubject;
  data: TData;
  version?: number;
}
