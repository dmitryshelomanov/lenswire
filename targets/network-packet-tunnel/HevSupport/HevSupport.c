#include "HevSupport.h"

#include <string.h>
#include <sys/socket.h>
#include <sys/ioctl.h>
#include <unistd.h>

typedef uint8_t u_int8_t;
typedef uint16_t u_int16_t;
typedef uint32_t u_int32_t;
typedef unsigned char u_char;

#ifndef CTLIOCGINFO
#define CTLIOCGINFO 0xc0644e03UL
#endif

struct ctl_info {
  u_int32_t ctl_id;
  char ctl_name[96];
};

struct sockaddr_ctl {
  u_char sc_len;
  u_char sc_family;
  u_int16_t ss_sysaddr;
  u_int32_t sc_id;
  u_int32_t sc_unit;
  u_int32_t sc_reserved[5];
};

#ifndef AF_SYSTEM
#define AF_SYSTEM 32
#endif

int lenswire_find_utun_fd(void) {
  struct ctl_info ctlInfo;
  memset(&ctlInfo, 0, sizeof(ctlInfo));
  strncpy(ctlInfo.ctl_name, "com.apple.net.utun_control", sizeof(ctlInfo.ctl_name) - 1);

  for (int fd = 0; fd <= 1024; fd++) {
    struct sockaddr_ctl addr;
    socklen_t len = sizeof(addr);
    memset(&addr, 0, sizeof(addr));
    int ret = getpeername(fd, (struct sockaddr *)&addr, &len);
    if (ret != 0 || addr.sc_family != AF_SYSTEM) {
      continue;
    }
    if (ctlInfo.ctl_id == 0) {
      ret = ioctl(fd, CTLIOCGINFO, &ctlInfo);
      if (ret != 0) {
        continue;
      }
    }
    if (addr.sc_id == ctlInfo.ctl_id) {
      return fd;
    }
  }
  return -1;
}
