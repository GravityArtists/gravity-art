const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const colorPicker = document.getElementById("colorPicker");
const countInput = document.getElementById("countInput");
const playPauseButton = document.getElementById("playPauseButton");

const Tools = {
  CURSOR: "cursor",
  BRUSH: "brush",
};

const Hover = {
  NONE: -1,
  CURSOR: 0,
  BRUSH: 1,
};

const G = 0.1;
const numBodies = 300;
const orbitRadius = canvas.width / 4;

let tool = Tools.CURSOR;
let hover = Hover.NONE;
let isDragging = false;
let lastBrushX = null;
let lastBrushY = null;
let paused = false;

class Brush {
  static BrushType = {
    POINT: "point",
    SCATTER: "scatter",
  };

  constructor() {
    this.size = 5;
    this.spread = 30;
    this.count = 10;
    this.density = 1;
    this.style = Brush.BrushType.POINT;
    this.density_counter = 0;
    this.max_density = 100;
    this.color = "#0000ff";
  }

  density_count() {
    this.density_counter = (this.density_counter + this.density) % this.max_density;
    return this.density_counter < this.density;
  }

  reset_density_counter() {
    this.density_counter = 0;
  }
}

class Icon {
  constructor(size, src) {
    this.size = size;
    this.image = new Image(this.size, this.size);
    this.image.src = src;
  }
}

class Menu {
  constructor() {
    this.width = canvas.width * 0.1;
    this.height = canvas.height * 0.8;
    this.x = canvas.width - this.width - 20;
    this.y = (canvas.height - this.height) / 2;
    this.mouse_icon = new Icon(this.width, "./assets/mouse-icon.png");
    this.paint_brush_icon = new Icon(this.width, "./assets/paint-brush-icon.png");
    this.icons = [this.mouse_icon, this.paint_brush_icon];
    this.icon_size = this.width - 20;
  }

  draw() {
    const x_padding = 10;
    const y_padding = 10;
    let y_offset = 0;

    ctx.fillStyle = 'rgba(128, 128, 128, 0.5)';
    ctx.fillRect(this.x, this.y, this.width, this.height);

    for (const icon of this.icons) {
      ctx.drawImage(icon.image, this.x + x_padding, this.y + y_padding + y_offset, this.icon_size, this.icon_size);
      y_offset += this.icon_size;
    }

    if (hover != -1) {
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.strokeRect(this.x + x_padding, this.y + y_padding + this.icon_size * hover, this.icon_size, this.icon_size);
    }
  }
}

class BrushSubMenu {
  constructor(parentMenu) {
    this.parentMenu = parentMenu;
    this.width = parentMenu.width * 0.8;
    this.height = parentMenu.height * 0.3;
    this.x = parentMenu.x - this.width - 10;
    this.y = parentMenu.y + parentMenu.icon_size + 20;
    this.options = ["Point", "Scatter"];
  }

  draw() {
    if (tool === Tools.BRUSH) {
      ctx.fillStyle = 'rgba(128, 128, 128, 0.8)';
      ctx.fillRect(this.x, this.y, this.width, this.height);

      ctx.font = '16px Arial';
      const optionHeight = this.height / this.options.length;
      for (let i = 0; i < this.options.length; i++) {
        const optionY = this.y + i * optionHeight;

        if (brush.style === this.options[i].toLowerCase()) {
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 2;
          ctx.strokeRect(this.x, optionY, this.width, optionHeight);
        }

        ctx.fillStyle = 'white';
        ctx.fillText(this.options[i], this.x + 10, optionY + optionHeight / 2);
      }

        const colorPickerX = this.x;
        const colorPickerY = this.y + optionHeight * this.options.length + 10;
        const countInputX = colorPickerX + 60; 
        const countInputY = colorPickerY;


      colorPicker.style.display = "block";
      countInput.style.display = "block";

      colorPicker.style.left = `${colorPickerX}px`;
      colorPicker.style.top = `${colorPickerY}px`;
      countInput.style.left = `${countInputX}px`;
      countInput.style.top = `${countInputY}px`;
    } else {
      colorPicker.style.display = "none";
      countInput.style.display = "none";
    }
  }
}

class Body {
  constructor(x, y, color, mass = Math.random() * 10 + 1, vx = 0, vy = 0, isSun = false) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.mass = mass;
    this.vx = vx;
    this.vy = vy;
    this.radius = Math.cbrt(this.mass) * (Math.random() * 2 + 1);
    this.isSun = isSun;
  }

  update(bodies) {
    if (this.isSun || paused) return;

    let ax = 0, ay = 0;
    for (let body of bodies) {
      if (body !== this) {
        let dx = body.x - this.x;
        let dy = body.y - this.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        let force = (G * this.mass * body.mass) / (dist * dist + 0.1);
        let acc = force / this.mass;
        ax += (dx / dist) * acc;
        ay += (dy / dist) * acc;
      }
    }
    this.vx += ax;
    this.vy += ay;
    this.x += this.vx;
    this.y += this.vy;
  }

  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
  }
}

const bodies = [];
const menu = new Menu();
const submenu = new BrushSubMenu(menu);
const sun = new Body(canvas.width / 2, canvas.height / 2, 'yellow', 1000, 0, 0, true);
const brush = new Brush();
bodies.push(sun);

for (let i = 0; i < numBodies; i++) {
  let angle = (i / numBodies) * Math.PI * 2;
  let distance = orbitRadius;
  let speed = Math.sqrt(G * sun.mass / distance);

  let x = sun.x + Math.cos(angle) * distance;
  let y = sun.y + Math.sin(angle) * distance;

  let vx = -Math.sin(angle) * speed;
  let vy = Math.cos(angle) * speed;

  bodies.push(new Body(x, y, 'blue', Math.random() * 30 + 1, vx, vy));
}

let lastTime = 0;
const tickRate = 60;
const tickInterval = 1000 / tickRate;

function animate(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const deltaTime = timestamp - lastTime;

  if (deltaTime >= tickInterval) {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let body of bodies) {
      body.update(bodies);
      body.draw();
    }

    menu.draw();
    submenu.draw();

    lastTime = timestamp;
  }

  requestAnimationFrame(animate);
}

function menu_icon(x, y) {
  if (x >= menu.x && x <= menu.x + menu.width && y >= menu.y && y <= menu.y + menu.height) {
    for (let i = 0; i < menu.icons.length; i++) {
      const iconX = menu.x + 10;
      const iconY = menu.y + 10 + i * menu.icon_size;
      const iconWidth = menu.icon_size;
      const iconHeight = menu.icon_size;

      if (x >= iconX && x <= iconX + iconWidth && y >= iconY && y <= iconY + iconHeight) {
        return i;
      }
    }
  }
  return -1;
}

function submenu_click(x, y) {
  if (tool !== Tools.BRUSH) return;
  const optionHeight = submenu.height / submenu.options.length;
  for (let i = 0; i < submenu.options.length; i++) {
    const optionY = submenu.y + i * optionHeight;
    if (x >= submenu.x && x <= submenu.x + submenu.width &&
        y >= optionY && y <= optionY + optionHeight) {
      brush.style = submenu.options[i].toLowerCase();
      return;
    }
  }
}

function spawnBrushParticles(x, y) {
  const color = brush.color;
  if (brush.style === Brush.BrushType.POINT) {
    bodies.push(new Body(x, y, color, Math.random() * 30 + 1, 0, 0));
  } else if (brush.style === Brush.BrushType.SCATTER) {
    for (let i = 0; i < brush.count; i++) {
      const angle = Math.random() * 2 * Math.PI;
      const radius = Math.random() * brush.spread;
      const dx = Math.cos(angle) * radius;
      const dy = Math.sin(angle) * radius;
      bodies.push(new Body(x + dx, y + dy, color, Math.random() * 30 + 1, 0, 0));
    }
  }
}

canvas.addEventListener('click', function(event) {
  const x = event.pageX;
  const y = event.pageY;

  let icon = menu_icon(x, y);
  if (icon === 0) {
    tool = Tools.CURSOR;
    canvas.style.cursor = "default";
  } else if (icon === 1) {
    tool = Tools.BRUSH;
    canvas.style.cursor = "crosshair";
  } else {
    submenu_click(x, y);
  }
}, false);

canvas.addEventListener('mousedown', function(event) {
  const x = event.pageX;
  const y = event.pageY;
  if (tool === Tools.BRUSH) {
    isDragging = true;
    lastBrushX = x;
    lastBrushY = y;
    brush.density_count();
    spawnBrushParticles(x, y);
  }
});

canvas.addEventListener('mousemove', function(event) {
  const x = event.pageX;
  const y = event.pageY;

  const icon = menu_icon(x, y);
  hover = icon !== -1 ? icon : Hover.NONE;

  if (isDragging && tool === Tools.BRUSH) {
    if (brush.density_count()) {
      spawnBrushParticles(x, y);
    }
    lastBrushX = x;
    lastBrushY = y;
  }
});

canvas.addEventListener('mouseup', function() {
  if (tool === Tools.BRUSH) {
    isDragging = false;
    brush.reset_density_counter();
    lastBrushX = null;
    lastBrushY = null;
  }
});

colorPicker.addEventListener("input", (e) => {
  brush.color = e.target.value;
});

countInput.addEventListener("input", (e) => {
  const value = parseInt(e.target.value);
  if (!isNaN(value) && value >= 1 && value <= 100) {
    brush.count = value;
  }
});

playPauseButton.addEventListener("click", () => {
  paused = !paused;
  playPauseButton.textContent = paused ? "Play" : "Pause";
});

animate();
