import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { basename, join, resolve } from 'path';
import { randomUUID } from 'crypto';

@Injectable()
export class ExpenseStorageService {
  private readonly root = resolve(process.env.EXPENSES_STORAGE_PATH || join(process.cwd(), '.data', 'expenses'));
  async save(expenseId: string, file: Express.Multer.File): Promise<string> {
    if (!file?.buffer?.length || file.size > 10 * 1024 * 1024) throw new BadRequestException('La pièce jointe est vide ou dépasse 10 Mo.');
    const ext = (basename(file.originalname).split('.').pop() || '').toLowerCase();
    if (!['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(ext)) throw new BadRequestException('Format de pièce jointe non autorisé.');
    const dir = join(this.root, expenseId); await mkdir(dir, { recursive: true });
    const relative = `${expenseId}/${randomUUID()}.${ext}`; await writeFile(join(this.root, relative), file.buffer); return relative;
  }
  async read(relative: string): Promise<Buffer> {
    if (!relative || relative.replace(/\\/g, '/').includes('..')) throw new BadRequestException('Chemin de pièce jointe invalide.');
    try { return await readFile(resolve(this.root, relative)); } catch { throw new NotFoundException('Pièce jointe introuvable.'); }
  }
}
