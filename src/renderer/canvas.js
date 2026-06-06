export function drawScore(ctx, config, engravingImage = null) {
  const canvas = ctx.canvas;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = config.canvas.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (engravingImage) {
    ctx.drawImage(engravingImage, 0, 0, canvas.width, canvas.height);
  }
}
