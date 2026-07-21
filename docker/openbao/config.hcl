# Persistent OpenBao for the dev stack: file storage on a volume so AI provider secrets survive a
# stack recreate (the previous `server -dev` kept everything in memory and lost them on every restart).
storage "file" {
  path = "/openbao/data"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = "true"
}

disable_mlock = true
ui            = false
