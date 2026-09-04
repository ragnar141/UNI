import "../styles/courses.css";

const preliminaryCourses = [
  {
    title: "On Knowledge and Human History",
    description:
      "The course is designed to provide a broad starting frame for the student’s further educational journey, examining knowledge as a structure, its inherent political charge and limitations, as well as the ways history is perceived and made.",
    chapters: 4,
    tone: "history",
  },
  {
    title: "On Mathematics",
    description:
      "The course delves into the roots of the discipline, acknowledging it as a first step in differentiation that allows for the empirical intelligibility of the world.",
    chapters: 5,
    tone: "mathematics",
  },
];

function CourseRow({ title, description, chapters, tone, variant }) {
  return (
    <article
      className={[
        "courseRow",
        `courseRow--${variant}`,
        `courseRow--tone-${tone}`,
      ].join(" ")}
    >
      <div className="courseRow__copy">
        <h2 className="courseRow__title">{title}</h2>
        <p className="courseRow__description">{description}</p>
      </div>

      <div className="courseRow__meta" aria-hidden="true">
        <span className="courseRow__chapters">
          {chapters} {chapters === 1 ? "chapter" : "chapters"}
        </span>
        <span className="courseRow__arrow">→</span>
      </div>
    </article>
  );
}

function CourseSection({ title, courses, variant }) {
  return (
    <section className={`courseSection courseSection--${variant}`}>
      <h1 className="courseSection__label">{title}</h1>

      <div className="courseSection__list">
        {courses.map((course) => (
          <CourseRow
            key={course.title}
            {...course}
            variant={variant}
          />
        ))}
      </div>
    </section>
  );
}

export default function CoursesPage() {
  return (
    <div className="coursesPage">
      <div className="coursesPage__inner">
        <CourseSection
          title="Preliminary Courses"
          courses={preliminaryCourses}
          variant="preliminary"
        />
      </div>
    </div>
  );
}
