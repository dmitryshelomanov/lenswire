#ifndef LenswireHevSupport_H
#define LenswireHevSupport_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/** Scan open fds for the Packet Tunnel utun control socket. Returns -1 if missing. */
int lenswire_find_utun_fd(void);

#ifdef __cplusplus
}
#endif

#endif /* LenswireHevSupport_H */
