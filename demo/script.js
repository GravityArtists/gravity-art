const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const Tools = {
    CURSOR: "cursor",
    BRUSH: "brush"
};





const G = 0.1;
const numBodies = 300;
const orbitRadius = canvas.width / 4;

let tool = Tools.CURSOR;
let isDragging = false;

class Brush {
    constructor() {
        this.size = 5;
        this.spread = 0;
        this.count = 1;
        this.density = 1;
    }
}

class Icon {
    constructor(size, src) {
        this.size = size;
        this.image = new Image(this.size, this.size);
        this.image.src = src; // Ensure the image source is set
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

        ctx.fillStyle = 'rgba(128, 128, 128, 0.5)'
        ctx.fillRect(this.x, this.y, this.width, this.height);
        for (const icon of this.icons){
            ctx.drawImage(icon.image, this.x + x_padding, this.y + y_padding + y_offset, this.icon_size, this.icon_size);
            y_offset += this.icon_size;
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
        if (this.isSun) return;
        
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
const sun = new Body(canvas.width / 2, canvas.height / 2, 'yellow', 1000, 0, 0, true);
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

function animate() {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let body of bodies) {
        body.update(bodies);
        body.draw();
    }
    menu.draw()
    requestAnimationFrame(animate);
}

canvas.addEventListener('click', function(event) {
    var x = event.pageX;
    var y = event.pageY;
    
    // Menu click
    if (x >= menu.x && x <= menu.x + menu.width && y >= menu.y && y <= menu.height) {
        for (let i = 0; i < menu.icons.length; i++) {
            const iconX = menu.x + 10;
            const iconY = menu.y + 10 + i * menu.icon_size;
            const iconWidth = menu.icon_size;
            const iconHeight = menu.icon_size;
    
            if (
                x >= iconX &&
                x <= iconX + iconWidth &&
                y >= iconY &&
                y <= iconY + iconHeight
            ) {
                if (i === 0) {
                    tool = Tools.CURSOR;
                    canvas.style.cursor = "default"; // Reset to default cursor
                } else if (i === 1) {
                    tool = Tools.BRUSH;
                    canvas.style.cursor = "crosshair"; // Change cursor to crosshair
                }
                break;
            }
        }
    }

    if (tool == Tools.BRUSH) {

    }
}, false);

canvas.addEventListener('mousedown', function(event) {
    if (tool === Tools.BRUSH) {
        isDragging = true;
    }
});

canvas.addEventListener('mousemove', function(event) {
    if (isDragging && tool === Tools.BRUSH) {
        const x = event.pageX;
        const y = event.pageY;

        // Draw a circle at the current mouse position

        bodies.push(new Body(x, y, 'blue', Math.random() * 30 + 1, 0, 0))
        console.log("inserting new body");
    }
});

canvas.addEventListener('mouseup', function() {
    if (tool === Tools.BRUSH) {
        isDragging = false;
    }
});

animate();

// newtons law force between two bodies
// F = (G * m1 * m2) / (r^2)