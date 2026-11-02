import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BaseApiClient } from '../generated/base-api-client';

export interface NotificationItem {
  id: string; type: string; title: string; message: string; severity: string;
  entityType?: string; entityId?: string; isRead: boolean; createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationsApiService {
  private readonly client = inject(BaseApiClient);
  list(unreadOnly = false): Observable<NotificationItem[]> { return this.client.get('/notifications', { params: { unreadOnly } }); }
  unreadCount(): Observable<{ count: number }> { return this.client.get('/notifications/unread-count'); }
  markRead(id: string): Observable<{ success: boolean }> { return this.client.patch(`/notifications/${id}/read`); }
  markAllRead(): Observable<{ updatedCount: number }> { return this.client.patch('/notifications/mark-all-read'); }
  sync(): Observable<{ createdAlertsCount: number }> { return this.client.post('/notifications/sync'); }
}
