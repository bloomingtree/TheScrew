/**
 * Message Bus - nanobot style message routing
 *
 * Responsibilities:
 * - Route inbound messages (user to agent)
 * - Route outbound messages (agent to user)
 * - Event emission and subscription
 * - Queue management
 */

import { EventEmitter } from 'events';
import { IInboundMessage, IOutboundMessage, MessageBusEvent, MessageBusEventPayload } from './types';

/**
 * Message queue configuration
 */
export interface MessageBusConfig {
  maxQueueSize?: number;
  processingInterval?: number;
}

/**
 * Message Bus - async message routing system
 */
export class MessageBus extends EventEmitter {
  private inboundQueue: IInboundMessage[] = [];
  private outboundQueue: IOutboundMessage[] = [];
  private processing: boolean = false;
  private maxQueueSize: number;
  private processingInterval: number;
  private processorTimer: NodeJS.Timeout | null = null;

  constructor(config?: MessageBusConfig) {
    super();
    this.maxQueueSize = config?.maxQueueSize || 1000;
    this.processingInterval = config?.processingInterval || 10;
    console.log('[MessageBus] Initialized');
  }

  /**
   * Send an inbound message (user to agent)
   */
  async sendInbound(message: IInboundMessage): Promise<void> {
    if (this.inboundQueue.length >= this.maxQueueSize) {
      throw new Error(`Inbound queue full (${this.maxQueueSize} messages)`);
    }

    this.inboundQueue.push(message);
    this.emit('inbound', message);
    console.log(`[MessageBus] Inbound message queued: ${message.id}`);

    if (!this.processing) {
      this.startProcessing();
    }
  }

  /**
   * Send an outbound message (agent to user)
   */
  async sendOutbound(message: IOutboundMessage): Promise<void> {
    if (this.outboundQueue.length >= this.maxQueueSize) {
      throw new Error(`Outbound queue full (${this.maxQueueSize} messages)`);
    }

    this.outboundQueue.push(message);
    this.emit('outbound', message);
    console.log(`[MessageBus] Outbound message sent: ${message.id}`);
  }

  /**
   * Get the next inbound message (non-blocking)
   */
  getNextInbound(): IInboundMessage | null {
    return this.inboundQueue.shift() || null;
  }

  /**
   * Get the next outbound message (non-blocking)
   */
  getNextOutbound(): IOutboundMessage | null {
    return this.outboundQueue.shift() || null;
  }

  /**
   * Wait for next inbound message (async)
   */
  async consumeInbound(timeout?: number): Promise<IInboundMessage | null> {
    return new Promise<IInboundMessage | null>(resolve => {
      const checkInterval = setInterval(() => {
        const message = this.getNextInbound();
        if (message) {
          clearInterval(checkInterval);
          resolve(message);
        }
      }, this.processingInterval);

      if (timeout) {
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve(null);
        }, timeout);
      }
    });
  }

  /**
   * Publish outbound message
   */
  async publishOutbound(message: IOutboundMessage): Promise<void> {
    await this.sendOutbound(message);
  }

  /**
   * Start processing queues
   */
  private startProcessing(): void {
    if (this.processing) return;

    this.processing = true;
    this.processorTimer = setInterval(() => {
      this.processQueues();
    }, this.processingInterval);
  }

  /**
   * Stop processing queues
   */
  stopProcessing(): void {
    this.processing = false;
    if (this.processorTimer) {
      clearInterval(this.processorTimer);
      this.processorTimer = null;
    }
    console.log('[MessageBus] Processing stopped');
  }

  /**
   * Process queued messages
   */
  private processQueues(): void {
    // Process inbound messages
    while (this.inboundQueue.length > 0) {
      const message = this.inboundQueue[0]; // Peek
      this.emit('process', message);
      this.inboundQueue.shift(); // Remove after emitting
    }

    // Stop processing if no more messages
    if (this.inboundQueue.length === 0 && this.outboundQueue.length === 0) {
      this.stopProcessing();
    }
  }

  /**
   * Subscribe to inbound messages
   */
  onInbound(handler: (message: IInboundMessage) => void): this {
    this.on('inbound', handler);
    return this;
  }

  /**
   * Subscribe to outbound messages
   */
  onOutbound(handler: (message: IOutboundMessage) => void): this {
    this.on('outbound', handler);
    return this;
  }

  /**
   * Subscribe to process events (when a message is about to be processed)
   */
  onProcess(handler: (message: IInboundMessage) => void): this {
    this.on('process', handler);
    return this;
  }

  /**
   * Subscribe to error events
   */
  onError(handler: (error: Error) => void): this {
    this.on('error', handler);
    return this;
  }

  /**
   * Subscribe to any event by type
   */
  on(event: MessageBusEvent, handler: (payload: MessageBusEventPayload) => void): this;
  on(event: string, handler: (...args: any[]) => void): this;
  on(event: string, handler: (...args: any[]) => void): this {
    return super.on(event, handler);
  }

  /**
   * Emit an event
   */
  emit(event: MessageBusEvent, payload: MessageBusEventPayload): boolean;
  emit(event: string, ...args: any[]): boolean;
  emit(event: string, ...args: any[]): boolean {
    return super.emit(event, ...args);
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    inboundQueueSize: number;
    outboundQueueSize: number;
    processing: boolean;
  } {
    return {
      inboundQueueSize: this.inboundQueue.length,
      outboundQueueSize: this.outboundQueue.length,
      processing: this.processing,
    };
  }

  /**
   * Clear all queues
   */
  clear(): void {
    this.inboundQueue = [];
    this.outboundQueue = [];
    console.log('[MessageBus] Queues cleared');
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopProcessing();
    this.clear();
    this.removeAllListeners();
    console.log('[MessageBus] Destroyed');
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let messageBusInstance: MessageBus | null = null;

/**
 * Get the singleton MessageBus instance
 */
export function getMessageBus(config?: MessageBusConfig): MessageBus {
  if (!messageBusInstance) {
    messageBusInstance = new MessageBus(config);
  }
  return messageBusInstance;
}

/**
 * Reset the singleton (useful for testing)
 */
export function resetMessageBus(): void {
  if (messageBusInstance) {
    messageBusInstance.destroy();
  }
  messageBusInstance = null;
}

export default MessageBus;
