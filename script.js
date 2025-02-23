const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const G = 0.1;
const numBodies = 300;
const orbitRadius = canvas.width / 4; 

class Body {
    constructor(x, y, mass = Math.random() * 10 + 1, vx = 0, vy = 0, isSun = false) {
        this.x = x;
        this.y = y;
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
        ctx.fillStyle = this.isSun ? "yellow" : "blue";
        ctx.fill();
    }
}

const bodies = [];
const sun = new Body(canvas.width / 2, canvas.height / 2, 1000, 0, 0, true);
bodies.push(sun);

for (let i = 0; i < numBodies; i++) {
    let angle = (i / numBodies) * Math.PI * 2;
    let distance = orbitRadius;
    let speed = Math.sqrt(G * sun.mass / distance);

    let x = sun.x + Math.cos(angle) * distance;
    let y = sun.y + Math.sin(angle) * distance;

    let vx = -Math.sin(angle) * speed;
    let vy = Math.cos(angle) * speed;

    bodies.push(new Body(x, y, Math.random() * 30 + 1, vx, vy));
}

function animate() {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let body of bodies) {
        body.update(bodies);
        body.draw();
    }
    requestAnimationFrame(animate);
}

animate();


// newtons law force between two bodies
// F = (G * m1 * m2) / (r^2)