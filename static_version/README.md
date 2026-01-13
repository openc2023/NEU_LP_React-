# Pure Static Version

This folder is the destination for the pure static build.

To generate the static version here, run:

```bash
npm run build:static
```

Once built, the files in this directory are "pure static". They use relative paths (`./`) so they can be:
1. Placed in any sub-folder on a server.
2. Served by any basic static file server.
