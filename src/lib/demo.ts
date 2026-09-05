import { segmentSource, type LearningSuite } from "./learning";

export const sampleNotebook = { id: "sample", title: "Newton's laws of motion", grade: 11, subject: "Physical Sciences", module: "Newton's laws of motion" };

const sampleMaterial = [
  {
    id: "sample-laws", title: "Newton's laws of motion", type: "textbook_chapter" as const,
    text: `BOKAMOSO ORIGINAL SAMPLE NOTES | Grade 11 | Physical Sciences | Newton's laws of motion

1. Forces and motion
A force is a push or pull caused by an interaction between objects. Force is a vector: it has magnitude and direction, and is measured in newtons (N). The net force is the vector sum of all forces acting on a single object. Balanced forces have a net force of zero.

2. Newton's first law: inertia
An object remains at rest, or continues moving at constant velocity in a straight line, unless a non-zero net force acts on it. Inertia is an object's resistance to a change in its velocity. Greater mass means greater inertia. A book resting on a desk remains at rest when the forces on it are balanced. A moving object does not need a continuing net force to keep a constant velocity.

3. Newton's second law: acceleration
When a non-zero net force acts on an object of constant mass, it accelerates in the direction of the net force. The relationship is F_net = ma. Force is measured in newtons (N), mass in kilograms (kg), and acceleration in metres per second squared (m/s^2). Acceleration is the rate of change of velocity. For constant mass, doubling net force doubles acceleration. For the same net force, doubling mass halves acceleration.

4. Newton's third law: interaction pairs
When object A exerts a force on object B, object B simultaneously exerts an equal-magnitude force in the opposite direction on object A. These forces act on different objects and therefore do not cancel on a single object's free-body diagram. A rocket pushes exhaust gas backwards; the gas exerts a forward force on the rocket. A person pushes a wall; the wall pushes back on the person.`,
  },
  {
    id: "sample-forces", title: "Forces & free-body diagrams", type: "textbook_chapter" as const,
    text: `BOKAMOSO ORIGINAL SAMPLE NOTES | Grade 11 | Physical Sciences | Newton's laws of motion

Representing forces
A free-body diagram represents a single object as a point or simple box and uses labelled arrows to show all external forces acting on that object. The direction of an arrow shows the direction of a force. Do not include forces exerted by that object on other objects.

Common forces
Weight acts downwards because of gravity. The normal force is the contact force perpendicular to a surface. Friction opposes relative motion or the tendency for relative motion between surfaces. Tension acts along a taut rope or string.

Balanced forces
A book rests on a horizontal desk. Its downward weight and upward normal force are balanced, so its net force is zero and its acceleration is zero. These are not a Newton's third-law pair: both act on the book. The partner to the desk's force on the book is the book's force on the desk.

Finding net force
Choose a positive direction before adding forces. If a box has a force of 10 N to the right and friction of 4 N to the left, choose right as positive: F_net = 10 - 4 = 6 N to the right. For a mass of 2 kg, a = F_net / m = 6 / 2 = 3 m/s^2 to the right.`,
  },
  {
    id: "sample-practice", title: "Worked examples & practice", type: "textbook_chapter" as const,
    text: `BOKAMOSO ORIGINAL SAMPLE NOTES | Grade 11 | Physical Sciences | Newton's laws of motion

Example 1: Find acceleration
A 4 kg trolley experiences a net force of 12 N to the right. Use F_net = ma. Rearrange: a = F_net / m. Substitute: a = 12 / 4 = 3 m/s^2 to the right. State both magnitude and direction.

Example 2: Compare masses
Two trolleys experience the same net force. The second trolley has twice the mass of the first. Because a = F_net / m, the second trolley's acceleration is half the first trolley's acceleration.

Example 3: Recognise inertia
A trolley moving in a straight line has a net force of zero. It continues at constant velocity. Zero net force means zero acceleration, not necessarily zero velocity.

Example 4: Interaction pairs
A rocket pushes exhaust gas backwards. The exhaust gas pushes the rocket forwards with an equal-magnitude, opposite-direction force. The pair acts on different objects: rocket and gas.

Problem-solving checklist
Identify the object. Draw all forces acting on it. Choose a positive direction. Find the net force. Use F_net = ma. Substitute values in SI units. Give the answer with its unit and direction.`,
  },
];

export const sampleSources = sampleMaterial.map((source) => segmentSource({ ...source, format: "text", grade: 11, subject: "Physical Sciences", module: sampleNotebook.module, sample: true }));

export const sampleSuite: LearningSuite = {
  moduleSummary: "Why does a trolley keep moving? What makes a rocket lift off? Newton's three laws connect forces to the motion around us. Explore inertia, discover how force and mass affect acceleration, and make sense of action-reaction pairs, one concept at a time.",
  mindMap: [
    { id: "motion", label: "Newton's laws of motion", parentId: null, summary: "Three laws connect interactions, forces and changes in motion." },
    { id: "net-force", label: "Forces & vectors", parentId: "motion", summary: "Force is a push or pull with magnitude and direction. Net force is the vector sum of forces on one object." },
    { id: "inertia", label: "First law: inertia", parentId: "motion", summary: "With zero net force, an object stays at rest or continues at constant velocity." },
    { id: "second-law", label: "Second law: F = ma", parentId: "motion", summary: "A non-zero net force accelerates an object in the direction of that force." },
    { id: "third-law", label: "Third law: interactions", parentId: "motion", summary: "Interaction pairs are equal and opposite forces acting on different objects." },
    { id: "free-body", label: "Free-body diagrams", parentId: "net-force", summary: "Draw labelled arrows for all external forces on a single object." },
    { id: "mass", label: "Mass & acceleration", parentId: "second-law", summary: "For the same net force, doubling the mass halves the acceleration." },
    { id: "calculation", label: "Apply: a = F / m", parentId: "second-law", summary: "A net force of 12 N on a 4 kg trolley produces 3 m/s^2 acceleration in the force's direction." },
    { id: "rocket", label: "Apply: rocket & exhaust", parentId: "third-law", summary: "The rocket pushes gas backwards. The gas pushes the rocket forwards." },
  ],
  flashcards: [
    { cardId: "flash-inertia", front: "What happens to an object's motion when the net force is zero?", back: "It stays at rest or continues at constant velocity in a straight line.", hint: "Zero acceleration does not necessarily mean zero velocity." },
    { cardId: "flash-second", front: "What is the relationship between net force, mass and acceleration?", back: "F_net = ma. Acceleration is in the direction of the net force.", hint: "Force is measured in N, mass in kg and acceleration in m/s^2." },
    { cardId: "flash-mass", front: "At the same net force, what happens to acceleration when mass doubles?", back: "Acceleration halves, because a = F_net / m.", hint: "Mass is in the denominator." },
    { cardId: "flash-third", front: "Why don't Newton's third-law forces cancel each other?", back: "They act on different objects, not on the same object.", hint: "Identify which object receives each force." },
    { cardId: "flash-apply", front: "A 4 kg trolley has a 12 N net force to the right. Find its acceleration.", back: "a = 12 / 4 = 3 m/s^2 to the right.", hint: "Use a = F_net / m and include the direction." },
  ],
  videoSummaryScript: [
    { segment: "The big picture", timestamp: "00:00-00:15", visualCue: "A stationary book, a moving trolley and a rocket. Label each object.", narration: "A book on your desk. A trolley moving in a straight line. A rocket lifting off. What connects them? Newton's three laws describe how forces relate to the motion of objects." },
    { segment: "Things keep doing their thing", timestamp: "00:15-00:30", visualCue: "A trolley moves steadily. Opposing force arrows balance. Show net force = 0.", narration: "First, inertia. If the net force is zero, an object stays at rest or keeps moving at constant velocity. Zero net force does not mean it has to stop. It means no acceleration." },
    { segment: "A force changes motion", timestamp: "00:30-00:45", visualCue: "Show F_net = ma, then a = F_net / m. Highlight force, mass and acceleration in turn.", narration: "Second, a non-zero net force causes acceleration. Net force equals mass times acceleration. Keep the mass constant and double the force: acceleration doubles. Keep the force constant and double the mass: acceleration halves." },
    { segment: "Put the numbers to work", timestamp: "00:45-01:00", visualCue: "Label a trolley 4 kg and its net-force arrow 12 N. Reveal a = 12 / 4 = 3 m/s^2.", narration: "Let's try a calculation. A four-kilogram trolley experiences a net force of twelve newtons to the right. Divide force by mass: twelve divided by four is three metres per second squared, to the right." },
    { segment: "Every interaction has two sides", timestamp: "01:00-01:15", visualCue: "A rocket pushes exhaust downwards. Separate arrows show the force on the gas and the force on the rocket.", narration: "Third, forces come in pairs. A rocket pushes gas backwards, and the gas pushes the rocket forwards. These forces are equal in magnitude and opposite in direction, but act on different objects." },
    { segment: "Your next step", timestamp: "01:15-01:30", visualCue: "Show the checklist: choose object, draw forces, find net force, apply F_net = ma, state unit and direction.", narration: "Now bring it together. Identify one object, draw the forces acting on it, and calculate the net force. Then apply net force equals mass times acceleration. Always include the unit and the direction in your answer." },
  ],
  diagnosticAssessment: [
    { questionId: "diagnostic-inertia", question: "A trolley moves in a straight line with zero net force. What happens next?", options: ["It gradually stops.", "It continues at constant velocity.", "It speeds up.", "It changes direction."], correctOptionIndex: 1, bloomLevel: "Recall", gapNodeIfWrong: "inertia", explanation: "Newton's first law says zero net force produces zero acceleration. The trolley therefore continues at constant velocity." },
    { questionId: "diagnostic-mass", question: "Two trolleys experience the same net force. The second has twice the mass. How does its acceleration compare?", options: ["Twice as large", "The same", "Half as large", "Four times as large"], correctOptionIndex: 2, bloomLevel: "Understanding", gapNodeIfWrong: "mass", explanation: "Since a = F_net / m, doubling mass at the same net force halves acceleration." },
    { questionId: "diagnostic-calculation", question: "A 4 kg trolley experiences a net force of 12 N to the right. What is its acceleration?", options: ["48 m/s^2 to the right", "3 m/s^2 to the left", "8 m/s^2 to the right", "3 m/s^2 to the right"], correctOptionIndex: 3, bloomLevel: "Application", gapNodeIfWrong: "second-law", explanation: "a = F_net / m = 12 / 4 = 3 m/s^2. Acceleration points in the same direction as the net force: right." },
  ],
  gamifiedQuestPlan: { questTitle: "Become a force finder", narrativeHook: "Your trolley is ready. Connect forces, mass and acceleration to work out what happens next.", targetNode: "second-law", xpReward: 100, badgeName: "Force Finder" },
};