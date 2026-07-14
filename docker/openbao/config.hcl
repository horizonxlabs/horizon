ui = true

api_addr = "http://openbao:8200"

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = 1
}

# The service is private to the Compose network. Terminate TLS at the private
# ingress if operators choose to expose the UI; do not publish port 8200 by default.
storage "file" {
  path = "/openbao/file"
}
