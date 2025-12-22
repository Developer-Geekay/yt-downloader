import { HttpInterceptorFn } from '@angular/common/http';

const USER = 'admin';
const PASS = 'change_this_password';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = btoa(`${USER}:${PASS}`);

  return next(
    req.clone({
      setHeaders: { Authorization: `Basic ${auth}` }
    })
  );
};
