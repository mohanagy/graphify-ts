// Hono app with named routes — v0.17 substrate target.

import { Hono } from 'hono'

export const honoApp = new Hono()

export function listProducts(): void {
  // Returns all products.
}

export function getProductById(): void {
  // Returns a single product by id.
}

export function createProduct(): void {
  // Persists a new product.
}

export function logRequest(): void {
  // Logs every request.
}

honoApp.use('/products/*', logRequest)
honoApp.get('/products', listProducts)
honoApp.get('/products/:id', getProductById)
honoApp.post('/products', createProduct)
