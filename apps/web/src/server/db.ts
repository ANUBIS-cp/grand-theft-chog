import { connect } from '@chog-city/server/db';

/** The shared database connection for route handlers. */
export function db() {
  return connect().db;
}
