export const APP_BASE_PATH = "/k6";

export function withBasePath(path: string): string {
  if (!path.startsWith("/")) {
    return path;
  }
  if (path === APP_BASE_PATH || path.startsWith(`${APP_BASE_PATH}/`)) {
    return path;
  }
  return `${APP_BASE_PATH}${path}`;
}

export function stripBasePath(pathname: string): string {
  if (pathname === APP_BASE_PATH) {
    return "/";
  }
  if (pathname.startsWith(`${APP_BASE_PATH}/`)) {
    return pathname.slice(APP_BASE_PATH.length);
  }
  return pathname || "/";
}
