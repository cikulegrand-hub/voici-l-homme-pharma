// Utility to throw HTTP exceptions with a structured payload containing an error code
import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes.enum';

export function throwError(
  code: ErrorCode,
  message: string,
  status: HttpStatus = HttpStatus.BAD_REQUEST,
) {
  throw new HttpException({ code, message }, status);
}

