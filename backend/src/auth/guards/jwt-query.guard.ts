import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtQueryGuard extends AuthGuard('jwt-query') {}
