interface JQuery {
  ripples(options: {
    imageUrl?: string
    resolution?: number
    dropRadius?: number
    perturbance?: number
    interactive?: boolean
  }): JQuery
  ripples(method: 'drop', x: number, y: number, radius: number, strength: number): JQuery
  ripples(method: 'updateSize' | 'destroy' | 'pause' | 'play'): JQuery
}

declare module 'jquery.ripples'
