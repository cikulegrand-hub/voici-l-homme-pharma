import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BaseApiClient } from '../generated/base-api-client';
import { NotificationItem, NotificationType, NotificationSeverity } from '@vhp/shared';

export type { NotificationItem, NotificationType, NotificationSeverity };

export interface NotificationQueryParams {
  unreadOnly?: boolean | string;
  type?: string;
  severity?: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationsApiService {
  private readonly client = inject(BaseApiClient);

  list(params?: boolean | NotificationQueryParams): Observable<NotificationItem[]> {
    let queryParams: Record<string, any> = {};
    if (typeof params === 'boolean') {
      queryParams = { unreadOnly: params };
    } else if (params) {
      queryParams = { ...params };
    }
    return this.client.get('/notifications', { params: queryParams });
  }

  unreadCount(): Observable<{ count: number }> {
    return this.client.get('/notifications/unread-count');
  }

  markRead(id: string): Observable<{ success: boolean }> {
    return this.client.patch(`/notifications/${id}/read`);
  }

  markAllRead(): Observable<{ updatedCount: number }> {
    return this.client.patch('/notifications/mark-all-read');
  }

  sync(): Observable<{ createdAlertsCount: number }> {
    return this.client.post('/notifications/sync');
  }
}
