/**
 * Server-Sent Events (SSE) Service
 * Real-time communication service for sensor events
 */

import { Response } from 'express';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

export interface SSEClient {
  id: string;
  response: Response;
  connectedAt: Date;
  lastPing?: Date;
  subscriptions: Set<string>;
}

export interface SSEEvent {
  event: string;
  data: any;
  id?: string;
  retry?: number;
}

export class SSEService extends EventEmitter {
  private static instance: SSEService | null = null;
  private clients: Map<string, SSEClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly CLIENT_TIMEOUT = 60000; // 60 seconds

  private constructor() {
    super();
    this.startHeartbeat();
  }

  static getInstance(): SSEService {
    if (!SSEService.instance) {
      SSEService.instance = new SSEService();
    }
    return SSEService.instance;
  }

  /**
   * Add a new SSE client
   */
  addClient(res: Response, subscriptions: string[] = ['*']): string {
    const clientId = uuidv4();
    
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

    const client: SSEClient = {
      id: clientId,
      response: res,
      connectedAt: new Date(),
      subscriptions: new Set(subscriptions)
    };

    this.clients.set(clientId, client);

    // Handle client disconnect
    res.on('close', () => {
      this.removeClient(clientId);
    });

    res.on('error', (error) => {
      console.error(`SSE client error for ${clientId}:`, error);
      this.removeClient(clientId);
    });

    // Send initial connection event
    this.sendToClient(clientId, {
      event: 'connected',
      data: { 
        clientId, 
        connectedAt: client.connectedAt.toISOString(),
        subscriptions: Array.from(client.subscriptions)
      }
    });

    console.log(`SSE client connected: ${clientId}`);
    this.emit('client_connected', { clientId, subscriptions });

    return clientId;
  }

  /**
   * Remove a client
   */
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      try {
        client.response.end();
      } catch (error) {
        // Client may already be closed
      }
      
      this.clients.delete(clientId);
      console.log(`SSE client disconnected: ${clientId}`);
      this.emit('client_disconnected', { clientId });
    }
  }

  /**
   * Send event to specific client
   */
  sendToClient(clientId: string, event: SSEEvent): boolean {
    const client = this.clients.get(clientId);
    if (!client) {
      return false;
    }

    try {
      const message = this.formatSSEMessage(event);
      client.response.write(message);
      client.lastPing = new Date();
      return true;
    } catch (error) {
      console.error(`Error sending to client ${clientId}:`, error);
      this.removeClient(clientId);
      return false;
    }
  }

  /**
   * Broadcast event to all clients (or clients subscribed to specific events)
   */
  broadcast(event: SSEEvent, eventType?: string): number {
    let sentCount = 0;

    for (const [clientId, client] of this.clients) {
      // Check if client is subscribed to this event type
      if (eventType && !client.subscriptions.has('*') && !client.subscriptions.has(eventType)) {
        continue;
      }

      if (this.sendToClient(clientId, event)) {
        sentCount++;
      }
    }

    return sentCount;
  }

  /**
   * Send event to clients subscribed to specific topics
   */
  sendToSubscribers(event: SSEEvent, topics: string[]): number {
    let sentCount = 0;

    for (const [clientId, client] of this.clients) {
      const hasSubscription = client.subscriptions.has('*') || 
        topics.some(topic => client.subscriptions.has(topic));

      if (hasSubscription && this.sendToClient(clientId, event)) {
        sentCount++;
      }
    }

    return sentCount;
  }

  /**
   * Add subscription for a client
   */
  addSubscription(clientId: string, topic: string): boolean {
    const client = this.clients.get(clientId);
    if (client) {
      client.subscriptions.add(topic);
      return true;
    }
    return false;
  }

  /**
   * Remove subscription for a client
   */
  removeSubscription(clientId: string, topic: string): boolean {
    const client = this.clients.get(clientId);
    if (client) {
      client.subscriptions.delete(topic);
      return true;
    }
    return false;
  }

  /**
   * Get client information
   */
  getClient(clientId: string): SSEClient | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Get all clients
   */
  getAllClients(): SSEClient[] {
    return Array.from(this.clients.values());
  }

  /**
   * Get client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Format SSE message according to specification
   */
  private formatSSEMessage(event: SSEEvent): string {
    let message = '';

    if (event.id) {
      message += `id: ${event.id}\n`;
    }

    if (event.event) {
      message += `event: ${event.event}\n`;
    }

    if (event.retry) {
      message += `retry: ${event.retry}\n`;
    }

    // Handle multiline data
    const dataLines = JSON.stringify(event.data).split('\n');
    for (const line of dataLines) {
      message += `data: ${line}\n`;
    }

    message += '\n'; // Empty line to end the message

    return message;
  }

  /**
   * Send heartbeat to all clients
   */
  private sendHeartbeat(): void {
    const heartbeatEvent: SSEEvent = {
      event: 'heartbeat',
      data: { timestamp: new Date().toISOString() }
    };

    for (const clientId of this.clients.keys()) {
      this.sendToClient(clientId, heartbeatEvent);
    }

    // Clean up stale clients
    this.cleanupStaleClients();
  }

  /**
   * Remove clients that haven't responded to heartbeat
   */
  private cleanupStaleClients(): void {
    const now = new Date();
    const staleClients: string[] = [];

    for (const [clientId, client] of this.clients) {
      const lastActivity = client.lastPing || client.connectedAt;
      const timeSinceActivity = now.getTime() - lastActivity.getTime();

      if (timeSinceActivity > this.CLIENT_TIMEOUT) {
        staleClients.push(clientId);
      }
    }

    for (const clientId of staleClients) {
      console.log(`Removing stale SSE client: ${clientId}`);
      this.removeClient(clientId);
    }
  }

  /**
   * Start heartbeat timer
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, this.HEARTBEAT_INTERVAL);
  }

  /**
   * Stop heartbeat timer
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Get service statistics
   */
  getStats(): {
    clientCount: number;
    uptime: number;
    totalEventsSent: number;
    averageConnectionDuration: number;
  } {
    const now = new Date();
    let totalConnectionTime = 0;

    for (const client of this.clients.values()) {
      totalConnectionTime += now.getTime() - client.connectedAt.getTime();
    }

    return {
      clientCount: this.clients.size,
      uptime: process.uptime() * 1000,
      totalEventsSent: 0, // Could be tracked if needed
      averageConnectionDuration: this.clients.size > 0 ? totalConnectionTime / this.clients.size : 0
    };
  }

  /**
   * Shutdown the service
   */
  shutdown(): void {
    console.log('Shutting down SSE service...');
    
    this.stopHeartbeat();
    
    // Disconnect all clients
    for (const clientId of this.clients.keys()) {
      this.removeClient(clientId);
    }
    
    this.removeAllListeners();
    SSEService.instance = null;
    
    console.log('SSE service shutdown complete');
  }
}

// Create and export singleton instance
export const sseService = SSEService.getInstance();

// Convenience methods for common sensor events
export const sensorEvents = {
  sensorConnected: (sensorInfo: any) => sseService.broadcast({
    event: 'sensor_connected',
    data: sensorInfo,
    id: uuidv4()
  }, 'sensors'),

  sensorDisconnected: (sensorInfo: any) => sseService.broadcast({
    event: 'sensor_disconnected', 
    data: sensorInfo,
    id: uuidv4()
  }, 'sensors'),

  captureProgress: (progressInfo: any) => sseService.broadcast({
    event: 'capture_progress',
    data: progressInfo,
    id: uuidv4()
  }, 'capture'),

  captureComplete: (result: any) => sseService.broadcast({
    event: 'capture_complete',
    data: result,
    id: uuidv4()
  }, 'capture'),

  captureError: (error: any) => sseService.broadcast({
    event: 'capture_error',
    data: error,
    id: uuidv4()
  }, 'capture'),

  deviceError: (error: any) => sseService.broadcast({
    event: 'device_error',
    data: error,
    id: uuidv4()
  }, 'sensors')
};